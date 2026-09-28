using System.Text.Json;
using Npgsql;

namespace IdeaFlow;

/// <summary>İstehsal təklifləri, investisiyalar və satıcı ilkin sifarişləri.</summary>
public static class Deals
{
    public static void Map(WebApplication app)
    {
        // ------------------------------------------------- istehsalçı təklifi
        app.MapPost("/api/projects/{id:int}/offers", async (HttpContext ctx, int id, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "maker");
            if (fail is not null) return fail;

            var price = Api.Dec(body, "price");
            var moq = Api.Int(body, "moq");
            var days = Api.Int(body, "days");
            if (price is not > 0) return Api.Err(400, "e_price");
            if (moq is not > 0) return Api.Err(400, "e_moq");
            if (days is not > 0) return Api.Err(400, "e_days");

            await using var c = await Db.OpenAsync();
            var (authorId, status) = await ProjectsApi.LoadOwnerAsync(c, id);
            if (authorId == 0) return Api.Err(404, "e_notFound");
            if (!Rules.CanOffer(u!.Role, status)) return Api.Err(400, "e_stage");

            await using var ins = new NpgsqlCommand("""
                insert into offers (project_id, maker_id, price, moq, days, note)
                values (@p, @m, @pr, @mo, @d, @n) returning id
                """, c);
            ins.Parameters.AddWithValue("p", id);
            ins.Parameters.AddWithValue("m", u.Id);
            ins.Parameters.AddWithValue("pr", price.Value);
            ins.Parameters.AddWithValue("mo", moq.Value);
            ins.Parameters.AddWithValue("d", days.Value);
            ins.Parameters.AddWithValue("n", Api.Str(body, "note", 1000));
            var offerId = (int)(await ins.ExecuteScalarAsync())!;

            // İlk təklif gələndə layihə avtomatik «istehsalçı axtarışı»na keçir —
            // müəllif əl ilə status dəyişməyi unutsa da təkliflər itmir.
            if (status == "demand") await ProjectsApi.SetStatusAsync(c, id, "findmaker", u.Id);

            await Audit.LogAsync(c, u.Id, "offer_create", "offer", offerId, new { project = id }, ctx);
            return Results.Json(new { ok = true, id = offerId });
        });

        app.MapPost("/api/offers/{id:int}/accept", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var (projectId, makerId, authorId, status) = await LoadOfferAsync(c, id);
            if (projectId == 0) return Api.Err(404, "e_notFound");
            if (u!.Role != "admin" && authorId != u.Id) return Api.Err(403, "e_forbidden");
            if (status != "findmaker") return Api.Err(400, "e_stage");

            await using var tx = await c.BeginTransactionAsync();
            // Bir layihədə yalnız bir istehsalçı qalır — qalan təkliflər avtomatik rədd edilir
            // ki, istehsalçılar «cavab gözləyirəm» vəziyyətində asılı qalmasın.
            await using (var upd = new NpgsqlCommand("""
                update offers set status = case when id = @id then 'accepted' else 'rejected' end
                where project_id = @p and status = 'pending'
                """, c, tx))
            {
                upd.Parameters.AddWithValue("id", id);
                upd.Parameters.AddWithValue("p", projectId);
                await upd.ExecuteNonQueryAsync();
            }
            await ProjectsApi.SetStatusAsync(c, projectId, "findinv", u.Id, tx);
            await tx.CommitAsync();

            await Audit.LogAsync(c, u.Id, "offer_accept", "offer", id, new { project = projectId, maker = makerId }, ctx);
            return Results.Json(new { ok = true, status = "findinv" });
        });

        app.MapPost("/api/offers/{id:int}/reject", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var (projectId, _, authorId, _) = await LoadOfferAsync(c, id);
            if (projectId == 0) return Api.Err(404, "e_notFound");
            if (u!.Role != "admin" && authorId != u.Id) return Api.Err(403, "e_forbidden");

            await SetSimpleStatus(c, "offers", id, "rejected");
            await Audit.LogAsync(c, u.Id, "offer_reject", "offer", id, null, ctx);
            return Results.Json(new { ok = true });
        });

        app.MapPost("/api/offers/{id:int}/withdraw", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "maker");
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var (projectId, makerId, _, _) = await LoadOfferAsync(c, id);
            if (projectId == 0) return Api.Err(404, "e_notFound");
            if (makerId != u!.Id) return Api.Err(403, "e_forbidden");

            await SetSimpleStatus(c, "offers", id, "withdrawn");
            await Audit.LogAsync(c, u.Id, "offer_withdraw", "offer", id, null, ctx);
            return Results.Json(new { ok = true });
        });

        // ------------------------------------------------------ investisiya
        app.MapPost("/api/projects/{id:int}/investments", async (HttpContext ctx, int id, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "investor");
            if (fail is not null) return fail;

            var amount = Api.Dec(body, "amount");
            var kind = Api.Str(body, "kind", 20);
            if (amount is not > 0) return Api.Err(400, "e_amount");
            if (kind is not ("share" or "loan" or "royalty")) kind = "share";

            await using var c = await Db.OpenAsync();
            var (authorId, status) = await ProjectsApi.LoadOwnerAsync(c, id);
            if (authorId == 0) return Api.Err(404, "e_notFound");
            if (!Rules.CanInvest(u!.Role, status)) return Api.Err(400, "e_stage");

            await using var ins = new NpgsqlCommand("""
                insert into investments (project_id, investor_id, amount, kind, note)
                values (@p, @i, @a, @k, @n) returning id
                """, c);
            ins.Parameters.AddWithValue("p", id);
            ins.Parameters.AddWithValue("i", u.Id);
            ins.Parameters.AddWithValue("a", amount.Value);
            ins.Parameters.AddWithValue("k", kind);
            ins.Parameters.AddWithValue("n", Api.Str(body, "note", 1000));
            var invId = (int)(await ins.ExecuteScalarAsync())!;

            await Audit.LogAsync(c, u.Id, "investment_create", "investment", invId, new { project = id, amount }, ctx);
            return Results.Json(new { ok = true, id = invId });
        });

        app.MapPost("/api/investments/{id:int}/accept", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var (projectId, _, authorId, status) = await LoadInvestmentAsync(c, id);
            if (projectId == 0) return Api.Err(404, "e_notFound");
            if (u!.Role != "admin" && authorId != u.Id) return Api.Err(403, "e_forbidden");
            // Sövdələşməyə keçid yalnız istehsalçı seçiləndən sonra mümkündür.
            if (status != "findinv") return Api.Err(400, "e_needMaker");

            await using var tx = await c.BeginTransactionAsync();
            await SetSimpleStatus(c, "investments", id, "accepted", tx);
            await ProjectsApi.SetStatusAsync(c, projectId, "deal", u.Id, tx);
            await tx.CommitAsync();

            await Audit.LogAsync(c, u.Id, "investment_accept", "investment", id, new { project = projectId }, ctx);
            return Results.Json(new { ok = true, status = "deal" });
        });

        app.MapPost("/api/investments/{id:int}/reject", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var (projectId, _, authorId, _) = await LoadInvestmentAsync(c, id);
            if (projectId == 0) return Api.Err(404, "e_notFound");
            if (u!.Role != "admin" && authorId != u.Id) return Api.Err(403, "e_forbidden");

            await SetSimpleStatus(c, "investments", id, "rejected");
            await Audit.LogAsync(c, u.Id, "investment_reject", "investment", id, null, ctx);
            return Results.Json(new { ok = true });
        });

        // -------------------------------------------------- ilkin sifariş
        app.MapPost("/api/projects/{id:int}/preorder", async (HttpContext ctx, int id, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "seller");
            if (fail is not null) return fail;

            var qty = Api.Int(body, "qty");
            if (qty is not > 0) return Api.Err(400, "e_qty");

            await using var c = await Db.OpenAsync();
            var (authorId, status) = await ProjectsApi.LoadOwnerAsync(c, id);
            if (authorId == 0) return Api.Err(404, "e_notFound");
            if (!Rules.CanPreorder(u!.Role, status)) return Api.Err(400, "e_stage");

            await using var cmd = new NpgsqlCommand("""
                insert into preorders (project_id, seller_id, qty) values (@p, @s, @q)
                on conflict (project_id, seller_id) do update set qty = excluded.qty
                """, c);
            cmd.Parameters.AddWithValue("p", id);
            cmd.Parameters.AddWithValue("s", u.Id);
            cmd.Parameters.AddWithValue("q", qty.Value);
            await cmd.ExecuteNonQueryAsync();

            await Audit.LogAsync(c, u.Id, "preorder", "project", id, new { qty }, ctx);
            return Results.Json(new { ok = true });
        });

        app.MapDelete("/api/projects/{id:int}/preorder", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "seller");
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand(
                "delete from preorders where project_id = @p and seller_id = @s", c);
            cmd.Parameters.AddWithValue("p", id);
            cmd.Parameters.AddWithValue("s", u!.Id);
            await cmd.ExecuteNonQueryAsync();
            return Results.Json(new { ok = true });
        });
    }

    // ------------------------------------------------ layihə kartı üçün oxu
    /// <summary>
    /// Təkliflər hər kəsə göstərilmir: müəllif və admin hamısını görür, istehsalçı
    /// yalnız öz təklifini, qalanlar isə yalnız qəbul edilmiş təklifi. Əks halda
    /// rəqib zavodlar bir-birinin qiymətini oxuyardı.
    /// </summary>
    public static async Task<List<object>> OffersAsync(NpgsqlConnection c, int projectId,
        int viewerId, string viewerRole, bool isAuthor)
    {
        var filter = (viewerRole == "admin" || isAuthor) ? ""
            : viewerRole == "maker" ? " and o.maker_id = @me"
            : " and o.status = 'accepted'";

        await using var cmd = new NpgsqlCommand($"""
            select o.id, o.price, o.moq, o.days, o.note, o.status, o.created_at,
                   u.id, u.full_name, u.company, u.trust
            from offers o join users u on u.id = o.maker_id
            where o.project_id = @p{filter} order by o.id desc
            """, c);
        cmd.Parameters.AddWithValue("p", projectId);
        cmd.Parameters.AddWithValue("me", viewerId);
        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new
            {
                id = r.GetInt32(0), price = r.GetDecimal(1), moq = r.GetInt32(2), days = r.GetInt32(3),
                note = r.GetString(4), status = r.GetString(5), createdAt = r.GetDateTime(6),
                makerId = r.GetInt32(7), makerName = r.GetString(8),
                makerCompany = r.GetString(9), makerTrust = r.GetInt32(10),
            });
        return list;
    }

    public static async Task<List<object>> InvestmentsAsync(NpgsqlConnection c, int projectId,
        int viewerId, string viewerRole, bool isAuthor)
    {
        var filter = (viewerRole == "admin" || isAuthor) ? ""
            : viewerRole == "investor" ? " and i.investor_id = @me"
            : " and i.status = 'accepted'";

        await using var cmd = new NpgsqlCommand($"""
            select i.id, i.amount, i.kind, i.note, i.status, i.created_at,
                   u.id, u.full_name, u.company, u.trust
            from investments i join users u on u.id = i.investor_id
            where i.project_id = @p{filter} order by i.id desc
            """, c);
        cmd.Parameters.AddWithValue("p", projectId);
        cmd.Parameters.AddWithValue("me", viewerId);
        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new
            {
                id = r.GetInt32(0), amount = r.GetDecimal(1), kind = r.GetString(2),
                note = r.GetString(3), status = r.GetString(4), createdAt = r.GetDateTime(5),
                investorId = r.GetInt32(6), investorName = r.GetString(7),
                investorCompany = r.GetString(8), investorTrust = r.GetInt32(9),
            });
        return list;
    }

    /// <summary>Ümumi sifariş sayı kartda onsuz da görünür; burada kimin nə qədər
    /// rezerv etdiyi yalnız müəllifə, adminə və satıcının özünə açılır.</summary>
    public static async Task<List<object>> PreordersAsync(NpgsqlConnection c, int projectId,
        int viewerId, string viewerRole, bool isAuthor)
    {
        if (viewerRole != "admin" && !isAuthor && viewerRole != "seller") return [];
        var filter = (viewerRole == "admin" || isAuthor) ? "" : " and r.seller_id = @me";

        await using var cmd = new NpgsqlCommand($"""
            select r.id, r.qty, r.created_at, u.id, u.full_name, u.company
            from preorders r join users u on u.id = r.seller_id
            where r.project_id = @p{filter} order by r.qty desc
            """, c);
        cmd.Parameters.AddWithValue("p", projectId);
        cmd.Parameters.AddWithValue("me", viewerId);
        var list = new List<object>();
        await using var rd = await cmd.ExecuteReaderAsync();
        while (await rd.ReadAsync())
            list.Add(new
            {
                id = rd.GetInt32(0), qty = rd.GetInt32(1), createdAt = rd.GetDateTime(2),
                sellerId = rd.GetInt32(3), sellerName = rd.GetString(4), sellerCompany = rd.GetString(5),
            });
        return list;
    }

    // ------------------------------------------------------------ köməkçilər
    private static async Task<(int ProjectId, int MakerId, int AuthorId, string Status)>
        LoadOfferAsync(NpgsqlConnection c, int offerId)
    {
        await using var cmd = new NpgsqlCommand("""
            select o.project_id, o.maker_id, p.author_id, p.status
            from offers o join projects p on p.id = o.project_id where o.id = @id
            """, c);
        cmd.Parameters.AddWithValue("id", offerId);
        await using var r = await cmd.ExecuteReaderAsync();
        return await r.ReadAsync()
            ? (r.GetInt32(0), r.GetInt32(1), r.GetInt32(2), r.GetString(3))
            : (0, 0, 0, "");
    }

    private static async Task<(int ProjectId, int InvestorId, int AuthorId, string Status)>
        LoadInvestmentAsync(NpgsqlConnection c, int invId)
    {
        await using var cmd = new NpgsqlCommand("""
            select i.project_id, i.investor_id, p.author_id, p.status
            from investments i join projects p on p.id = i.project_id where i.id = @id
            """, c);
        cmd.Parameters.AddWithValue("id", invId);
        await using var r = await cmd.ExecuteReaderAsync();
        return await r.ReadAsync()
            ? (r.GetInt32(0), r.GetInt32(1), r.GetInt32(2), r.GetString(3))
            : (0, 0, 0, "");
    }

    private static async Task SetSimpleStatus(NpgsqlConnection c, string table, int id, string status,
        NpgsqlTransaction? tx = null)
    {
        // `table` yalnız bu faylın daxilindən sabit sətirlə gəlir — istifadəçi girişi deyil.
        await using var cmd = new NpgsqlCommand($"update {table} set status = @s where id = @id", c, tx);
        cmd.Parameters.AddWithValue("s", status);
        cmd.Parameters.AddWithValue("id", id);
        await cmd.ExecuteNonQueryAsync();
    }
}
