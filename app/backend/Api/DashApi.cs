using Npgsql;

namespace IdeaFlow;

/// <summary>Rola görə kabinet göstəriciləri, bildirişlər və açıq kataloqlar.</summary>
public static class DashApi
{
    public static void Map(WebApplication app)
    {
        // ----------------------------------------------------------- kabinet
        app.MapGet("/api/dashboard", async (HttpContext ctx) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var tiles = u!.Role switch
            {
                "author" => await AuthorTiles(c, u.Id),
                "maker" => await MakerTiles(c, u.Id),
                "investor" => await InvestorTiles(c, u.Id),
                "seller" => await SellerTiles(c, u.Id),
                _ => await AdminTiles(c),
            };
            return Results.Json(new { role = u.Role, trust = u.Trust, tiles });
        });

        // -------------------------------------------------------- bildirişlər
        app.MapGet("/api/notifications", async (HttpContext ctx) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var sql = u!.Role switch
            {
                // Müəllif: layihələrimə gələn cavabsız təklif və investisiyalar.
                "author" => """
                    select 'n_newOffer', p.id, p.title, o.created_at
                    from offers o join projects p on p.id = o.project_id
                    where p.author_id = @u and o.status = 'pending'
                    union all
                    select 'n_newInvest', p.id, p.title, i.created_at
                    from investments i join projects p on p.id = i.project_id
                    where p.author_id = @u and i.status = 'pending'
                    """,
                // İstehsalçı: təkliflərimə verilən qərarlar + gücümə uyğun yeni sorğular.
                "maker" => """
                    select case when o.status = 'accepted' then 'n_offerAccepted' else 'n_offerRejected' end,
                           p.id, p.title, o.created_at
                    from offers o join projects p on p.id = o.project_id
                    where o.maker_id = @u and o.status in ('accepted','rejected')
                    union all
                    select 'n_newRequest', p.id, p.title, p.updated_at
                    from projects p
                    where p.status in ('demand','findmaker')
                      and not exists (select 1 from offers o2 where o2.project_id = p.id and o2.maker_id = @u)
                    """,
                "investor" => """
                    select case when i.status = 'accepted' then 'n_investAccepted' else 'n_investRejected' end,
                           p.id, p.title, i.created_at
                    from investments i join projects p on p.id = i.project_id
                    where i.investor_id = @u and i.status in ('accepted','rejected')
                    union all
                    select 'n_seekingFunds', p.id, p.title, p.updated_at
                    from projects p
                    where p.status = 'findinv'
                      and not exists (select 1 from investments i2 where i2.project_id = p.id and i2.investor_id = @u)
                    """,
                // Satıcı: rezerv etdiyim məhsullar istehsala/satışa keçəndə.
                "seller" => """
                    select 'n_toProduction', p.id, p.title, p.updated_at
                    from preorders r join projects p on p.id = r.project_id
                    where r.seller_id = @u and p.status in ('prod','sales')
                    union all
                    select 'n_newProduct', p.id, p.title, p.updated_at
                    from projects p
                    where p.status in ('findinv','deal','prod')
                      and not exists (select 1 from preorders r2 where r2.project_id = p.id and r2.seller_id = @u)
                    """,
                _ => """
                    select 'n_pendingUser', null::int, u2.full_name, u2.created_at
                    from users u2 where u2.status = 'pending' and @u = @u
                    union all
                    select 'n_pendingProject', p.id, p.title, p.updated_at
                    from projects p where p.status = 'assess'
                    """,
            };

            await using var cmd = new NpgsqlCommand($"select * from ({sql}) x order by 4 desc limit 20", c);
            cmd.Parameters.AddWithValue("u", u.Id);

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                list.Add(new
                {
                    key = r.GetString(0),
                    projectId = r.IsDBNull(1) ? (int?)null : r.GetInt32(1),
                    title = r.GetString(2),
                    at = r.GetDateTime(3),
                });
            return Results.Json(list);
        });

        // ---------------------------------------------- istehsalçı / investor
        app.MapGet("/api/directory/{role}", async (HttpContext ctx, string role) =>
        {
            var (_, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;
            if (role is not ("maker" or "investor" or "seller")) return Api.Err(400, "e_role");

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                select u.id, u.full_name, u.company, u.trust,
                       (select count(*) from offers      o where o.maker_id    = u.id and o.status = 'accepted'),
                       (select count(*) from investments i where i.investor_id = u.id and i.status = 'accepted')
                from users u where u.role = @r and u.status = 'active'
                order by u.trust desc, u.full_name limit 200
                """, c);
            cmd.Parameters.AddWithValue("r", role);

            var list = new List<object>();
            await using var r2 = await cmd.ExecuteReaderAsync();
            while (await r2.ReadAsync())
                list.Add(new
                {
                    id = r2.GetInt32(0), name = r2.GetString(1), company = r2.GetString(2),
                    trust = r2.GetInt32(3), deals = (int)(r2.GetInt64(4) + r2.GetInt64(5)),
                });
            return Results.Json(list);
        });

        // ----------------------------------- tariflər (hamıya açıq, oxu üçün)
        app.MapGet("/api/settings/public", async (HttpContext ctx) =>
        {
            var (_, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;
            await using var c = await Db.OpenAsync();
            return Results.Json(await Settings.AllAsync(c));
        });
    }

    // ------------------------------------------------------------- kabinetlər
    private static async Task<object> AuthorTiles(NpgsqlConnection c, int me) => new
    {
        projects = await N(c, "select count(*) from projects where author_id = @u", me),
        avgRating = await N(c, "select coalesce(round(avg(rating)),0) from projects where author_id = @u and rating > 0", me),
        offers = await N(c, "select count(*) from offers o join projects p on p.id = o.project_id where p.author_id = @u and o.status = 'pending'", me),
        preorders = await N(c, "select coalesce(sum(r.qty),0) from preorders r join projects p on p.id = r.project_id where p.author_id = @u", me),
    };

    private static async Task<object> MakerTiles(NpgsqlConnection c, int me) => new
    {
        requests = await N(c, "select count(*) from projects p where p.status in ('demand','findmaker') and not exists (select 1 from offers o where o.project_id = p.id and o.maker_id = @u)", me),
        myOffers = await N(c, "select count(*) from offers where maker_id = @u and status = 'pending'", me),
        won = await N(c, "select count(*) from offers where maker_id = @u and status = 'accepted'", me),
        inProduction = await N(c, "select count(*) from offers o join projects p on p.id = o.project_id where o.maker_id = @u and o.status = 'accepted' and p.status in ('deal','prod','sales')", me),
    };

    private static async Task<object> InvestorTiles(NpgsqlConnection c, int me) => new
    {
        seeking = await N(c, "select count(*) from projects where status = 'findinv'", me),
        portfolio = await N(c, "select count(distinct project_id) from investments where investor_id = @u and status = 'accepted'", me),
        invested = await D(c, "select coalesce(sum(amount),0) from investments where investor_id = @u and status = 'accepted'", me),
        pending = await N(c, "select count(*) from investments where investor_id = @u and status = 'pending'", me),
    };

    private static async Task<object> SellerTiles(NpgsqlConnection c, int me) => new
    {
        pipeline = await N(c, "select count(*) from projects where status in ('demand','findmaker','findinv','deal','prod')", me),
        myPreorders = await N(c, "select coalesce(sum(qty),0) from preorders where seller_id = @u", me),
        onSale = await N(c, "select count(*) from projects where status = 'sales'", me),
        reserved = await N(c, "select count(*) from preorders where seller_id = @u", me),
    };

    private static async Task<object> AdminTiles(NpgsqlConnection c) => new
    {
        pendingUsers = await N(c, "select count(*) from users where status = 'pending'", 0),
        pendingProjects = await N(c, "select count(*) from projects where status = 'assess'", 0),
        activeUsers = await N(c, "select count(*) from users where status = 'active'", 0),
        deals = await N(c, "select count(*) from projects where status in ('deal','prod','sales')", 0),
    };

    private static async Task<long> N(NpgsqlConnection c, string sql, int me)
    {
        await using var cmd = new NpgsqlCommand(sql, c);
        if (sql.Contains("@u")) cmd.Parameters.AddWithValue("u", me);
        var v = await cmd.ExecuteScalarAsync();
        return v switch { long l => l, int i => i, decimal d => (long)d, _ => 0 };
    }

    private static async Task<decimal> D(NpgsqlConnection c, string sql, int me)
    {
        await using var cmd = new NpgsqlCommand(sql, c);
        if (sql.Contains("@u")) cmd.Parameters.AddWithValue("u", me);
        return await cmd.ExecuteScalarAsync() is decimal d ? d : 0m;
    }
}
