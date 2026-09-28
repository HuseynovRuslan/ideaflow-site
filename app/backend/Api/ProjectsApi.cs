using System.Text.Json;
using Npgsql;

namespace IdeaFlow;

public static class ProjectsApi
{
    /// <summary>
    /// Görünürlük şərti. Hər rol öz mərhələlərini görür, üstəgəl həmişə
    /// öz layihəsini və artıq iştirak etdiyi (təklif/investisiya/sifariş verdiyi) layihəni.
    /// </summary>
    private const string VisibleWhere = """
        (p.status = any(@vis)
         or p.author_id = @me
         or exists (select 1 from offers      o where o.project_id = p.id and o.maker_id    = @me)
         or exists (select 1 from investments i where i.project_id = p.id and i.investor_id = @me)
         or exists (select 1 from preorders   r where r.project_id = p.id and r.seller_id   = @me))
        """;

    private const string ListSelect = """
        select p.id, p.title, p.category, p.status, p.rating, p.price, p.unit_cost, p.moq,
               p.royalty, p.market, p.created_at, p.author_id, u.full_name, u.trust,
               coalesce(pre.qty, 0), coalesce(off.cnt, 0), coalesce(inv.total, 0)
        from projects p
        join users u on u.id = p.author_id
        left join (select project_id, sum(qty)    qty   from preorders                          group by 1) pre on pre.project_id = p.id
        left join (select project_id, count(*)    cnt   from offers      where status='pending' group by 1) off on off.project_id = p.id
        left join (select project_id, sum(amount) total from investments where status='accepted' group by 1) inv on inv.project_id = p.id
        """;

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/api/projects");

        // ------------------------------------------------------------ siyahı
        g.MapGet("", async (HttpContext ctx, string? cat, string? q, string? mine) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            var sql = ListSelect + " where " + (u!.Role == "admin" ? "true" : VisibleWhere);
            if (mine == "1") sql += " and p.author_id = @me";
            if (!string.IsNullOrWhiteSpace(cat) && cat != "all") sql += " and p.category = @cat";
            if (!string.IsNullOrWhiteSpace(q)) sql += " and (p.title ilike @q or u.full_name ilike @q)";
            sql += " order by p.updated_at desc limit 200";

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand(sql, c);
            cmd.Parameters.AddWithValue("vis", Rules.VisibleStatuses(u.Role));
            cmd.Parameters.AddWithValue("me", u.Id);
            if (!string.IsNullOrWhiteSpace(cat) && cat != "all") cmd.Parameters.AddWithValue("cat", cat);
            if (!string.IsNullOrWhiteSpace(q)) cmd.Parameters.AddWithValue("q", "%" + q.Trim() + "%");

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync()) list.Add(ReadCard(r));
            return Results.Json(list);
        });

        // ------------------------------------------------------------ yaratmaq
        g.MapPost("", async (HttpContext ctx, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "author", "admin");
            if (fail is not null) return fail;

            var title = Api.Str(body, "title", 160);
            var descr = Api.Str(body, "descr", 6000);
            var category = Api.Str(body, "category", 30);
            if (title.Length < 3) return Api.Err(400, "e_title");
            if (!Rules.Categories.Contains(category)) return Api.Err(400, "e_category");

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                insert into projects (author_id, title, descr, category, price, unit_cost, moq, royalty)
                values (@a, @t, @d, @c, @p, @uc, @m, @r) returning id
                """, c);
            cmd.Parameters.AddWithValue("a", u!.Id);
            cmd.Parameters.AddWithValue("t", title);
            cmd.Parameters.AddWithValue("d", descr);
            cmd.Parameters.AddWithValue("c", category);
            cmd.Parameters.AddWithValue("p", (object?)Api.Dec(body, "price") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("uc", (object?)Api.Dec(body, "unitCost") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("m", (object?)Api.Int(body, "moq") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("r", Math.Clamp(Api.Int(body, "royalty") ?? 8, 0, 50));
            var id = (int)(await cmd.ExecuteScalarAsync())!;

            await using (var log = new NpgsqlCommand(
                "insert into project_status_log (project_id, status, actor_id) values (@p,'draft',@a)", c))
            {
                log.Parameters.AddWithValue("p", id);
                log.Parameters.AddWithValue("a", u.Id);
                await log.ExecuteNonQueryAsync();
            }
            await Audit.LogAsync(c, u.Id, "project_create", "project", id, new { title }, ctx);
            return Results.Json(new { ok = true, id });
        });

        // ------------------------------------------------------------- detal
        g.MapGet("/{id:int}", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var sql = ListSelect + ", p.descr, p.risks, p.assessed_at where p.id = @id and " +
                      (u!.Role == "admin" ? "true" : VisibleWhere);
            await using var cmd = new NpgsqlCommand(sql, c);
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("vis", Rules.VisibleStatuses(u.Role));
            cmd.Parameters.AddWithValue("me", u.Id);

            Dictionary<string, object?> card;
            await using (var r = await cmd.ExecuteReaderAsync())
            {
                if (!await r.ReadAsync()) return Api.Err(404, "e_notFound");
                card = (Dictionary<string, object?>)ReadCard(r);
                card["descr"] = r.GetString(17);
                card["risks"] = JsonSerializer.Deserialize<string[]>(r.GetString(18)) ?? [];
                card["assessedAt"] = r.IsDBNull(19) ? null : r.GetDateTime(19);
            }

            var authorId = (int)card["authorId"]!;
            var status = (string)card["status"]!;
            var isOwner = authorId == u.Id;

            card["can"] = new
            {
                edit = (isOwner && status is "draft" or "assess" or "demand") || u.Role == "admin",
                assess = (isOwner || u.Role == "admin") && status is "draft" or "assess" or "demand",
                offer = Rules.CanOffer(u.Role, status),
                invest = Rules.CanInvest(u.Role, status),
                preorder = Rules.CanPreorder(u.Role, status),
                transitions = NextSteps(status, u.Role, isOwner),
            };
            card["offers"] = await Deals.OffersAsync(c, id, u.Id, u.Role, isOwner);
            card["investments"] = await Deals.InvestmentsAsync(c, id, u.Id, u.Role, isOwner);
            card["preorders"] = await Deals.PreordersAsync(c, id, u.Id, u.Role, isOwner);

            // Sənədlər (NDA, patent, müqavilə) və söhbət kataloqa baxan hər kəsə deyil,
            // yalnız layihənin iştirakçılarına açıqdır.
            var participant = await Extras.IsParticipantAsync(c, id, u.Id, u.Role);
            card["participant"] = participant;
            card["documents"] = participant ? await Extras.DocumentsAsync(c, id) : new List<object>();
            card["messages"] = participant ? await Extras.MessagesAsync(c, id) : new List<object>();
            return Results.Json(card);
        });

        // ---------------------------------------------------------- redaktə
        g.MapPatch("/{id:int}", async (HttpContext ctx, int id, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var (authorId, status) = await LoadOwnerAsync(c, id);
            if (authorId == 0) return Api.Err(404, "e_notFound");

            var isOwner = authorId == u!.Id;
            if (u.Role != "admin" && !(isOwner && status is "draft" or "assess" or "demand"))
                return Api.Err(403, "e_forbidden");

            var title = Api.Str(body, "title", 160);
            var descr = Api.Str(body, "descr", 6000);
            var category = Api.Str(body, "category", 30);
            if (title.Length is > 0 and < 3) return Api.Err(400, "e_title");
            if (category.Length > 0 && !Rules.Categories.Contains(category)) return Api.Err(400, "e_category");

            await using var cmd = new NpgsqlCommand("""
                update projects set
                  title     = coalesce(nullif(@t,''), title),
                  descr     = case when @dset then @d else descr end,
                  category  = coalesce(nullif(@c,''), category),
                  price     = coalesce(@p,  price),
                  unit_cost = coalesce(@uc, unit_cost),
                  moq       = coalesce(@m,  moq),
                  royalty   = coalesce(@r,  royalty),
                  updated_at = now()
                where id = @id
                """, c);
            cmd.Parameters.AddWithValue("t", title);
            cmd.Parameters.AddWithValue("d", descr);
            cmd.Parameters.AddWithValue("dset", body.TryGetProperty("descr", out _));
            cmd.Parameters.AddWithValue("c", category);
            cmd.Parameters.AddWithValue("p", (object?)Api.Dec(body, "price") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("uc", (object?)Api.Dec(body, "unitCost") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("m", (object?)Api.Int(body, "moq") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("r", (object?)Api.Int(body, "royalty") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("id", id);
            await cmd.ExecuteNonQueryAsync();

            await Audit.LogAsync(c, u.Id, "project_edit", "project", id, null, ctx);
            return Results.Json(new { ok = true });
        });

        // --------------------------------------------------- status keçidi
        g.MapPost("/{id:int}/status", async (HttpContext ctx, int id, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            var to = Api.Str(body, "to", 20);
            await using var c = await Db.OpenAsync();
            var (authorId, status) = await LoadOwnerAsync(c, id);
            if (authorId == 0) return Api.Err(404, "e_notFound");
            if (!Rules.CanTransition(status, to, u!.Role, authorId == u.Id)) return Api.Err(403, "e_transition");

            await SetStatusAsync(c, id, to, u.Id);
            await Audit.LogAsync(c, u.Id, "project_status", "project", id, new { from = status, to }, ctx);
            return Results.Json(new { ok = true, status = to });
        });

        // ------------------------------------------------- qiymətləndirmə
        g.MapPost("/{id:int}/assess", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            await using var get = new NpgsqlCommand("""
                select p.author_id, p.status, p.category, p.price, p.unit_cost, p.descr,
                       coalesce((select sum(qty) from preorders where project_id = p.id), 0)
                from projects p where p.id = @id
                """, c);
            get.Parameters.AddWithValue("id", id);

            int authorId = 0, preorders = 0;
            string status = "", category = "", descr = "";
            decimal? price = null, cost = null;
            await using (var r = await get.ExecuteReaderAsync())
            {
                if (!await r.ReadAsync()) return Api.Err(404, "e_notFound");
                authorId = r.GetInt32(0); status = r.GetString(1); category = r.GetString(2);
                price = r.IsDBNull(3) ? null : r.GetDecimal(3);
                cost = r.IsDBNull(4) ? null : r.GetDecimal(4);
                descr = r.GetString(5);
                preorders = (int)r.GetInt64(6);
            }
            if (u!.Role != "admin" && authorId != u.Id) return Api.Err(403, "e_forbidden");
            if (status is not ("draft" or "assess" or "demand")) return Api.Err(400, "e_stage");

            var res = Assess.Run(category, price, cost, preorders, descr);

            await using (var upd = new NpgsqlCommand("""
                update projects set rating = @r, market = @m, risks = @k, assessed_at = now(),
                       updated_at = now()
                where id = @id
                """, c))
            {
                upd.Parameters.AddWithValue("r", res.Rating);
                upd.Parameters.AddWithValue("m", res.Market);
                upd.Parameters.AddWithValue("k", JsonSerializer.Serialize(res.Risks));
                upd.Parameters.AddWithValue("id", id);
                await upd.ExecuteNonQueryAsync();
            }
            // Qaralama qiymətləndiriləndən sonra avtomatik «qiymətləndirmədə»yə keçir,
            // yəni admin təsdiqi növbəsinə düşür.
            if (status == "draft") await SetStatusAsync(c, id, "assess", u.Id);

            await Audit.LogAsync(c, u.Id, "project_assess", "project", id, new { res.Rating }, ctx);
            return Results.Json(new { ok = true, rating = res.Rating, market = res.Market, risks = res.Risks, breakdown = res.Breakdown });
        });
    }

    // ------------------------------------------------------------ köməkçilər
    internal static async Task<(int AuthorId, string Status)> LoadOwnerAsync(NpgsqlConnection c, int id)
    {
        await using var cmd = new NpgsqlCommand("select author_id, status from projects where id = @id", c);
        cmd.Parameters.AddWithValue("id", id);
        await using var r = await cmd.ExecuteReaderAsync();
        return await r.ReadAsync() ? (r.GetInt32(0), r.GetString(1)) : (0, "");
    }

    /// <summary>Statusu dəyişir və tarixçəyə yazır. Hesabatlar tarixçədən qurulur.</summary>
    internal static async Task SetStatusAsync(NpgsqlConnection c, int id, string status,
        int? actorId = null, NpgsqlTransaction? tx = null)
    {
        await using (var cmd = new NpgsqlCommand(
            "update projects set status = @s, updated_at = now() where id = @id", c, tx))
        {
            cmd.Parameters.AddWithValue("s", status);
            cmd.Parameters.AddWithValue("id", id);
            await cmd.ExecuteNonQueryAsync();
        }
        await using var log = new NpgsqlCommand(
            "insert into project_status_log (project_id, status, actor_id) values (@p, @s, @a)", c, tx);
        log.Parameters.AddWithValue("p", id);
        log.Parameters.AddWithValue("s", status);
        log.Parameters.AddWithValue("a", (object?)actorId ?? DBNull.Value);
        await log.ExecuteNonQueryAsync();
    }

    private static string[] NextSteps(string status, string role, bool isOwner)
    {
        var all = new[] { "assess", "demand", "findmaker", "findinv", "deal", "prod", "sales", "rejected", "draft" };
        return [.. all.Where(to => Rules.CanTransition(status, to, role, isOwner))];
    }

    private static object ReadCard(NpgsqlDataReader r) => new Dictionary<string, object?>
    {
        ["id"] = r.GetInt32(0),
        ["title"] = r.GetString(1),
        ["category"] = r.GetString(2),
        ["status"] = r.GetString(3),
        ["rating"] = r.GetInt32(4),
        ["price"] = r.IsDBNull(5) ? null : r.GetDecimal(5),
        ["unitCost"] = r.IsDBNull(6) ? null : r.GetDecimal(6),
        ["moq"] = r.IsDBNull(7) ? null : r.GetInt32(7),
        ["royalty"] = r.GetInt32(8),
        ["market"] = r.GetString(9),
        ["createdAt"] = r.GetDateTime(10),
        ["authorId"] = r.GetInt32(11),
        ["authorName"] = r.GetString(12),
        ["authorTrust"] = r.GetInt32(13),
        ["demand"] = (int)r.GetInt64(14),
        ["offerCount"] = (int)r.GetInt64(15),
        ["invested"] = r.GetDecimal(16),
    };
}
