using System.Text.Json;
using Npgsql;

namespace IdeaFlow;

/// <summary>Admin paneli — istifadəçi təsdiqi, layihə nəzarəti, hesabatlar, audit.</summary>
public static class AdminApi
{
    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/api/admin");

        // --------------------------------------------------------- hesabatlar
        g.MapGet("/stats", async (HttpContext ctx) =>
        {
            var (_, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var usersByStatus = await DictAsync(c, "select status, count(*) from users group by 1");
            var usersByRole = await DictAsync(c, "select role, count(*) from users group by 1");
            var projByStatus = await DictAsync(c, "select status, count(*) from projects group by 1");
            var projByCat = await DictAsync(c, "select category, count(*) from projects group by 1");

            // Huni: hər mərhələyə *nə vaxtsa* çatmış layihələrin sayı.
            var funnelRaw = await DictAsync(c,
                "select status, count(distinct project_id) from project_status_log group by 1");
            var funnel = Rules.Flow.Select(s => new { status = s, count = funnelRaw.GetValueOrDefault(s, 0) }).ToArray();

            var invested = await ScalarAsync(c, "select coalesce(sum(amount),0) from investments where status='accepted'");
            var pipeline = await ScalarAsync(c, """
                select coalesce(sum(r.qty * p.price), 0) from preorders r
                join projects p on p.id = r.project_id where p.price is not null
                """);

            var dealsByMonth = new List<object>();
            await using (var cmd = new NpgsqlCommand("""
                select to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(distinct project_id)
                from project_status_log
                where status = 'deal' and created_at > now() - interval '12 months'
                group by 1 order by 1
                """, c))
            await using (var r = await cmd.ExecuteReaderAsync())
                while (await r.ReadAsync())
                    dealsByMonth.Add(new { month = r.GetString(0), count = (int)r.GetInt64(1) });

            return Results.Json(new
            {
                usersByStatus, usersByRole, projByStatus, projByCat, funnel, dealsByMonth,
                money = new { invested, pipeline },
                totals = new
                {
                    users = usersByStatus.Values.Sum(),
                    projects = projByStatus.Values.Sum(),
                    pendingUsers = usersByStatus.GetValueOrDefault("pending", 0),
                    pendingProjects = projByStatus.GetValueOrDefault("assess", 0),
                },
            });
        });

        // ------------------------------------------------------ istifadəçilər
        g.MapGet("/users", async (HttpContext ctx, string? status, string? role, string? q) =>
        {
            var (_, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            var sql = """
                select u.id, u.email, u.full_name, u.role, u.status, u.company, u.phone,
                       u.trust, u.lang, u.note, u.created_at, u.approved_at,
                       (select count(*) from projects p where p.author_id = u.id)
                from users u where true
                """;
            if (!string.IsNullOrWhiteSpace(status) && status != "all") sql += " and u.status = @st";
            if (!string.IsNullOrWhiteSpace(role) && role != "all") sql += " and u.role = @ro";
            if (!string.IsNullOrWhiteSpace(q)) sql += " and (u.email ilike @q or u.full_name ilike @q or u.company ilike @q)";
            // Təsdiq gözləyənlər həmişə yuxarıda — admin ilk onları görsün.
            sql += " order by (u.status = 'pending') desc, u.created_at desc limit 500";

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand(sql, c);
            if (!string.IsNullOrWhiteSpace(status) && status != "all") cmd.Parameters.AddWithValue("st", status);
            if (!string.IsNullOrWhiteSpace(role) && role != "all") cmd.Parameters.AddWithValue("ro", role);
            if (!string.IsNullOrWhiteSpace(q)) cmd.Parameters.AddWithValue("q", "%" + q.Trim() + "%");

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                list.Add(new
                {
                    id = r.GetInt32(0), email = r.GetString(1), fullName = r.GetString(2),
                    role = r.GetString(3), status = r.GetString(4), company = r.GetString(5),
                    phone = r.GetString(6), trust = r.GetInt32(7), lang = r.GetString(8),
                    note = r.GetString(9), createdAt = r.GetDateTime(10),
                    approvedAt = r.IsDBNull(11) ? (DateTime?)null : r.GetDateTime(11),
                    projectCount = (int)r.GetInt64(12),
                });
            return Results.Json(list);
        });

        g.MapPost("/users/{id:int}/status", async (HttpContext ctx, int id, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            var to = Api.Str(body, "status", 20);
            if (to is not ("active" or "pending" or "blocked" or "rejected")) return Api.Err(400, "e_status");

            await using var c = await Db.OpenAsync();
            var target = await LoadUserAsync(c, id);
            if (target is null) return Api.Err(404, "e_notFound");
            if (target.Value.Role == "admin" && target.Value.Id != u!.Id && to != "active")
                return Api.Err(403, "e_noAdminLock"); // adminləri bir-birindən kilidləmək qadağandır
            if (target.Value.Id == u!.Id && to != "active")
                return Api.Err(400, "e_selfLock");    // admin özünü bloklaya bilməz

            await using (var cmd = new NpgsqlCommand("""
                update users set status = @s,
                  approved_at = case when @s = 'active' then now() else approved_at end,
                  approved_by = case when @s = 'active' then @by else approved_by end
                where id = @id
                """, c))
            {
                cmd.Parameters.AddWithValue("s", to);
                cmd.Parameters.AddWithValue("by", u.Id);
                cmd.Parameters.AddWithValue("id", id);
                await cmd.ExecuteNonQueryAsync();
            }
            // Bloklanan və ya rədd edilən istifadəçinin açıq sessiyaları dərhal bağlanır.
            if (to is "blocked" or "rejected") await Auth.DropAllSessionsAsync(c, id);

            await Audit.LogAsync(c, u.Id, "user_status", "user", id, new { to }, ctx);
            return Results.Json(new { ok = true });
        });

        // Toplu təsdiq / rədd — gözləmə siyahısını bir kliklə boşaltmaq üçün.
        // Adminlərə və özünə toxunmur (tək-tək endpoint-dəki qaydaların eynisi).
        g.MapPost("/users/bulk-status", async (HttpContext ctx, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            var to = Api.Str(body, "status", 20);
            if (to is not ("active" or "rejected")) return Api.Err(400, "e_status");
            if (!body.TryGetProperty("ids", out var idsEl) || idsEl.ValueKind != JsonValueKind.Array)
                return Api.Err(400, "e_body");
            var ids = idsEl.EnumerateArray()
                .Where(e => e.ValueKind == JsonValueKind.Number && e.TryGetInt32(out _))
                .Select(e => e.GetInt32()).Where(i => i != u!.Id).Distinct().Take(500).ToArray();
            if (ids.Length == 0) return Results.Json(new { ok = true, count = 0 });

            await using var c = await Db.OpenAsync();
            var changed = new List<int>();
            await using (var cmd = new NpgsqlCommand("""
                update users set status = @s,
                  approved_at = case when @s = 'active' then now() else approved_at end,
                  approved_by = case when @s = 'active' then @by else approved_by end
                where id = any(@ids) and role <> 'admin' and status = 'pending'
                returning id
                """, c))
            {
                cmd.Parameters.AddWithValue("s", to);
                cmd.Parameters.AddWithValue("by", u!.Id);
                cmd.Parameters.AddWithValue("ids", ids);
                await using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync()) changed.Add(r.GetInt32(0));
            }
            if (to == "rejected")
                foreach (var id in changed) await Auth.DropAllSessionsAsync(c, id);

            await Audit.LogAsync(c, u.Id, "user_bulk_status", "user", null, new { to, ids = changed }, ctx);
            return Results.Json(new { ok = true, count = changed.Count });
        });

        g.MapPatch("/users/{id:int}", async (HttpContext ctx, int id, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            var role = Api.Str(body, "role", 20);
            if (role.Length > 0 && !Rules.Roles.Contains(role) && role != "admin") return Api.Err(400, "e_role");

            await using var c = await Db.OpenAsync();
            var target = await LoadUserAsync(c, id);
            if (target is null) return Api.Err(404, "e_notFound");
            if (target.Value.Id == u!.Id && role.Length > 0 && role != "admin")
                return Api.Err(400, "e_selfDemote"); // admin özünü adminlikdən çıxara bilməz

            await using var cmd = new NpgsqlCommand("""
                update users set
                  full_name = coalesce(nullif(@n,''), full_name),
                  company   = case when @coset then @co else company end,
                  phone     = case when @phset then @ph else phone end,
                  note      = case when @noset then @no else note end,
                  role      = coalesce(nullif(@r,''), role),
                  trust     = coalesce(@t, trust)
                where id = @id
                """, c);
            cmd.Parameters.AddWithValue("n", Api.Str(body, "fullName", 120));
            cmd.Parameters.AddWithValue("co", Api.Str(body, "company", 160));
            cmd.Parameters.AddWithValue("coset", body.TryGetProperty("company", out _));
            cmd.Parameters.AddWithValue("ph", Api.Str(body, "phone", 40));
            cmd.Parameters.AddWithValue("phset", body.TryGetProperty("phone", out _));
            cmd.Parameters.AddWithValue("no", Api.Str(body, "note", 2000));
            cmd.Parameters.AddWithValue("noset", body.TryGetProperty("note", out _));
            cmd.Parameters.AddWithValue("r", role);
            var trust = Api.Int(body, "trust");
            cmd.Parameters.AddWithValue("t", trust is null ? DBNull.Value : Math.Clamp(trust.Value, 0, 100));
            cmd.Parameters.AddWithValue("id", id);
            await cmd.ExecuteNonQueryAsync();

            // Rol dəyişəndə köhnə sessiya köhnə icazələrlə qalmasın.
            if (role.Length > 0 && role != target.Value.Role) await Auth.DropAllSessionsAsync(c, id);

            await Audit.LogAsync(c, u.Id, "user_edit", "user", id, new { role, trust }, ctx);
            return Results.Json(new { ok = true });
        });

        g.MapPost("/users/{id:int}/password", async (HttpContext ctx, int id, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            var pass = Api.Str(body, "password", 200);
            if (pass.Length < 8) return Api.Err(400, "e_shortPass");

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand("update users set pass_hash = @p where id = @id", c);
            cmd.Parameters.AddWithValue("p", Passwords.Hash(pass));
            cmd.Parameters.AddWithValue("id", id);
            if (await cmd.ExecuteNonQueryAsync() == 0) return Api.Err(404, "e_notFound");

            await Auth.DropAllSessionsAsync(c, id);
            await Audit.LogAsync(c, u!.Id, "user_password_reset", "user", id, null, ctx);
            return Results.Json(new { ok = true });
        });

        g.MapDelete("/users/{id:int}", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;
            if (id == u!.Id) return Api.Err(400, "e_selfDelete");

            await using var c = await Db.OpenAsync();
            var target = await LoadUserAsync(c, id);
            if (target is null) return Api.Err(404, "e_notFound");
            if (target.Value.Role == "admin") return Api.Err(403, "e_noAdminDelete");

            // Silmə kaskadlıdır: layihələr, təkliflər, sifarişlər də gedir.
            // Ona görə admin paneldə bu düymə yalnız təsdiqlə işləyir.
            await using var cmd = new NpgsqlCommand("delete from users where id = @id", c);
            cmd.Parameters.AddWithValue("id", id);
            await cmd.ExecuteNonQueryAsync();

            await Audit.LogAsync(c, u.Id, "user_delete", "user", id, new { target.Value.Email }, ctx);
            return Results.Json(new { ok = true });
        });

        // ----------------------------------------------------------- layihə
        g.MapDelete("/projects/{id:int}", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            // Sənəd faylları bazadan silinməzdən əvvəl diskdən götürülür.
            await using (var docs = new NpgsqlCommand("select stored_name from documents where project_id = @p", c))
            {
                docs.Parameters.AddWithValue("p", id);
                var names = new List<string>();
                await using (var r = await docs.ExecuteReaderAsync())
                    while (await r.ReadAsync()) names.Add(r.GetString(0));
                foreach (var n in names)
                {
                    var path = Path.Combine(Extras.UploadDir, n);
                    if (File.Exists(path)) File.Delete(path);
                }
            }
            await using var del = new NpgsqlCommand("delete from projects where id = @p", c);
            del.Parameters.AddWithValue("p", id);
            if (await del.ExecuteNonQueryAsync() == 0) return Api.Err(404, "e_notFound");

            await Audit.LogAsync(c, u!.Id, "project_delete", "project", id, null, ctx);
            return Results.Json(new { ok = true });
        });

        // ------------------------------------------------------------ audit
        g.MapGet("/audit", async (HttpContext ctx, int? limit) =>
        {
            var (_, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                select a.id, a.action, a.entity, a.entity_id, a.meta, a.ip, a.created_at,
                       coalesce(u.full_name, '—'), coalesce(u.role, '')
                from audit a left join users u on u.id = a.actor_id
                order by a.id desc limit @l
                """, c);
            cmd.Parameters.AddWithValue("l", Math.Clamp(limit ?? 200, 1, 1000));

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                list.Add(new
                {
                    id = r.GetInt64(0), action = r.GetString(1), entity = r.GetString(2),
                    entityId = r.IsDBNull(3) ? (int?)null : r.GetInt32(3), meta = r.GetString(4),
                    ip = r.GetString(5), createdAt = r.GetDateTime(6),
                    actor = r.GetString(7), actorRole = r.GetString(8),
                });
            return Results.Json(list);
        });

        // --------------------------------------------------------- parametrlər
        g.MapGet("/settings", async (HttpContext ctx) =>
        {
            var (_, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;
            await using var c = await Db.OpenAsync();
            return Results.Json(await Settings.AllAsync(c));
        });

        g.MapPost("/settings", async (HttpContext ctx, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;
            if (body.ValueKind != JsonValueKind.Object) return Api.Err(400, "e_body");

            await using var c = await Db.OpenAsync();
            foreach (var prop in body.EnumerateObject())
            {
                if (!Settings.Known.Contains(prop.Name)) continue;
                var value = prop.Value.ValueKind == JsonValueKind.String
                    ? prop.Value.GetString()!
                    : prop.Value.ToString();
                await Settings.SetAsync(c, prop.Name, value);
            }
            await Audit.LogAsync(c, u!.Id, "settings_update", "settings", null, null, ctx);
            return Results.Json(new { ok = true });
        });
    }

    // ------------------------------------------------------------ köməkçilər
    private static async Task<Dictionary<string, int>> DictAsync(NpgsqlConnection c, string sql)
    {
        var d = new Dictionary<string, int>();
        await using var cmd = new NpgsqlCommand(sql, c);
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync()) d[r.GetString(0)] = (int)r.GetInt64(1);
        return d;
    }

    private static async Task<decimal> ScalarAsync(NpgsqlConnection c, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, c);
        var v = await cmd.ExecuteScalarAsync();
        return v is decimal d ? d : 0m;
    }

    private static async Task<(int Id, string Email, string Role)?> LoadUserAsync(NpgsqlConnection c, int id)
    {
        await using var cmd = new NpgsqlCommand("select id, email, role from users where id = @id", c);
        cmd.Parameters.AddWithValue("id", id);
        await using var r = await cmd.ExecuteReaderAsync();
        return await r.ReadAsync() ? (r.GetInt32(0), r.GetString(1), r.GetString(2)) : null;
    }
}

/// <summary>Admin paneldən dəyişdirilə bilən platforma parametrləri (komissiyalar və s.).</summary>
public static class Settings
{
    public static readonly string[] Known =
    [
        "fee_production", "fee_investment", "fee_sales", "fee_escrow", "fee_partner",
        "sub_author", "sub_maker", "sub_investor", "sub_seller",
        // Qeydiyyatda avtomatik aktivləşmə ("1"/"0") — admin hər hesabı əl ilə təsdiqləməsin.
        "auto_author", "auto_maker", "auto_investor", "auto_seller",
        // Claude təhlili: bir istifadəçinin gündə neçə dəfə işlədə biləcəyi.
        "ai_daily_limit",
    ];

    private static readonly Dictionary<string, string> Defaults = new()
    {
        ["fee_production"] = "5", ["fee_investment"] = "3", ["fee_sales"] = "3",
        ["fee_escrow"] = "1", ["fee_partner"] = "15",
        ["sub_author"] = "29", ["sub_maker"] = "99", ["sub_investor"] = "199", ["sub_seller"] = "99",
        // Default: heç kim avtomatik keçmir — təhlükəsiz başlanğıc, admin özü açır.
        ["auto_author"] = "0", ["auto_maker"] = "0", ["auto_investor"] = "0", ["auto_seller"] = "0",
        ["ai_daily_limit"] = "5",
    };

    public static async Task<Dictionary<string, string>> AllAsync(NpgsqlConnection c)
    {
        var d = new Dictionary<string, string>(Defaults);
        await using var cmd = new NpgsqlCommand("select key, value from settings", c);
        await using var r = await cmd.ExecuteReaderAsync();
        // Yalnız məlum parametrlər — cədvəldə daxili qeydlər də saxlanılır
        // (məs. «admin_granted:…»), onlar /api/settings/public ilə hamıya getməsin.
        while (await r.ReadAsync())
            if (Known.Contains(r.GetString(0))) d[r.GetString(0)] = r.GetString(1);
        return d;
    }

    public static async Task SetAsync(NpgsqlConnection c, string key, string value)
    {
        await using var cmd = new NpgsqlCommand(
            "insert into settings (key, value) values (@k, @v) on conflict (key) do update set value = excluded.value", c);
        cmd.Parameters.AddWithValue("k", key);
        cmd.Parameters.AddWithValue("v", value.Length > 40 ? value[..40] : value);
        await cmd.ExecuteNonQueryAsync();
    }
}
