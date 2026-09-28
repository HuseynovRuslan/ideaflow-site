using System.Text.Json;
using Npgsql;

namespace IdeaFlow;

public static class AuthApi
{
    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/api/auth").RequireRateLimiting("auth");

        // ---------------------------------------------------------- qeydiyyat
        g.MapPost("/register", async (HttpContext ctx, JsonElement body) =>
        {
            var email = Api.Str(body, "email", 200).ToLowerInvariant();
            var pass = Api.Str(body, "password", 200);
            var name = Api.Str(body, "fullName", 120);
            var role = Api.Str(body, "role", 20);
            var company = Api.Str(body, "company", 160);
            var phone = Api.Str(body, "phone", 40);
            var lang = Api.Str(body, "lang", 5);

            if (!IsEmail(email)) return Api.Err(400, "e_email");
            if (pass.Length < 8) return Api.Err(400, "e_shortPass");
            if (name.Length < 2) return Api.Err(400, "e_name");
            if (!Rules.Roles.Contains(role)) return Api.Err(400, "e_role");
            if (lang is not ("az" or "ru" or "en")) lang = "az";

            await using var c = await Db.OpenAsync();
            await using (var dup = new NpgsqlCommand("select 1 from users where lower(email) = @e", c))
            {
                dup.Parameters.AddWithValue("e", email);
                if (await dup.ExecuteScalarAsync() is not null) return Api.Err(409, "e_dupEmail");
            }

            await using var ins = new NpgsqlCommand("""
                insert into users (email, pass_hash, full_name, role, status, company, phone, lang)
                values (@e, @p, @n, @r, 'pending', @co, @ph, @l) returning id
                """, c);
            ins.Parameters.AddWithValue("e", email);
            ins.Parameters.AddWithValue("p", Passwords.Hash(pass));
            ins.Parameters.AddWithValue("n", name);
            ins.Parameters.AddWithValue("r", role);
            ins.Parameters.AddWithValue("co", company);
            ins.Parameters.AddWithValue("ph", phone);
            ins.Parameters.AddWithValue("l", lang);
            var id = (int)(await ins.ExecuteScalarAsync())!;

            await Audit.LogAsync(c, id, "register", "user", id, new { role }, ctx);

            // Hesab «pending» olsa da sessiya açırıq: istifadəçi öz statusunu görsün,
            // gözləmə ekranında qalsın. API-nin qalanı RequireActive ilə qapalıdır.
            var token = await Auth.CreateSessionAsync(c, id, ctx);
            Auth.SetCookie(ctx, token);
            return Results.Json(new { ok = true, status = "pending" });
        });

        // --------------------------------------------------------------- giriş
        g.MapPost("/login", async (HttpContext ctx, JsonElement body) =>
        {
            var email = Api.Str(body, "email", 200).ToLowerInvariant();
            var pass = Api.Str(body, "password", 200);

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand(
                "select id, pass_hash, status from users where lower(email) = @e", c);
            cmd.Parameters.AddWithValue("e", email);

            int id = 0; string hash = "", status = "";
            await using (var r = await cmd.ExecuteReaderAsync())
            {
                if (await r.ReadAsync())
                {
                    id = r.GetInt32(0); hash = r.GetString(1); status = r.GetString(2);
                }
            }

            // İstifadəçi yoxdursa da parolu yoxlayırıq — cavab vaxtına görə
            // mövcud e-poçtları sadalamağın qarşısını alır.
            var ok = hash.Length > 0
                ? Passwords.Verify(hash, pass)
                : Passwords.Verify(DummyHash.Value, pass) && false;

            if (!ok)
            {
                if (id > 0) await Audit.LogAsync(c, id, "login_fail", "user", id, null, ctx);
                return Api.Err(401, "e_badLogin");
            }
            if (status == "blocked") return Api.Err(403, "e_blocked");
            if (status == "rejected") return Api.Err(403, "e_rejected");

            var token = await Auth.CreateSessionAsync(c, id, ctx);
            Auth.SetCookie(ctx, token);
            await Audit.LogAsync(c, id, "login", "user", id, null, ctx);
            return Results.Json(new { ok = true, status });
        });

        // --------------------------------------------------------------- çıxış
        g.MapPost("/logout", async (HttpContext ctx) =>
        {
            var token = ctx.Request.Cookies[Auth.CookieName];
            if (!string.IsNullOrEmpty(token)) await Auth.DropSessionAsync(token);
            Auth.ClearCookie(ctx);
            return Results.Json(new { ok = true });
        });

        // -------------------------------------------------------------- profil
        app.MapGet("/api/me", (HttpContext ctx) =>
        {
            var u = Api.User(ctx);
            if (u is null) return Api.Err(401, "e_auth");
            return Results.Json(new
            {
                id = u.Id, email = u.Email, fullName = u.FullName, role = u.Role,
                status = u.Status, trust = u.Trust, lang = u.Lang, company = u.Company,
            });
        });

        app.MapPost("/api/me/lang", async (HttpContext ctx, JsonElement body) =>
        {
            var u = Api.User(ctx);
            if (u is null) return Api.Err(401, "e_auth");
            var lang = Api.Str(body, "lang", 5);
            if (lang is not ("az" or "ru" or "en")) return Api.Err(400, "e_lang");

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand("update users set lang = @l where id = @i", c);
            cmd.Parameters.AddWithValue("l", lang);
            cmd.Parameters.AddWithValue("i", u.Id);
            await cmd.ExecuteNonQueryAsync();
            return Results.Json(new { ok = true });
        });

        app.MapPost("/api/me/password", async (HttpContext ctx, JsonElement body) =>
        {
            var u = Api.User(ctx);
            if (u is null) return Api.Err(401, "e_auth");
            var oldPass = Api.Str(body, "old", 200);
            var newPass = Api.Str(body, "new", 200);
            if (newPass.Length < 8) return Api.Err(400, "e_shortPass");

            await using var c = await Db.OpenAsync();
            await using var get = new NpgsqlCommand("select pass_hash from users where id = @i", c);
            get.Parameters.AddWithValue("i", u.Id);
            var hash = (string?)await get.ExecuteScalarAsync();
            if (hash is null || !Passwords.Verify(hash, oldPass)) return Api.Err(403, "e_badPass");

            await using var upd = new NpgsqlCommand("update users set pass_hash = @p where id = @i", c);
            upd.Parameters.AddWithValue("p", Passwords.Hash(newPass));
            upd.Parameters.AddWithValue("i", u.Id);
            await upd.ExecuteNonQueryAsync();

            // Parol dəyişəndə bütün köhnə sessiyalar bağlanır, sonra cari cihaz üçün
            // yenisi açılır — oğurlanmış cookie ilə qalmaq mümkün olmasın.
            await Auth.DropAllSessionsAsync(c, u.Id);
            var token = await Auth.CreateSessionAsync(c, u.Id, ctx);
            Auth.SetCookie(ctx, token);
            await Audit.LogAsync(c, u.Id, "password_change", "user", u.Id, null, ctx);
            return Results.Json(new { ok = true });
        });
    }

    private static bool IsEmail(string s) =>
        s.Length >= 5 && s.Count(ch => ch == '@') == 1 &&
        s.IndexOf('@') > 0 && s.LastIndexOf('.') > s.IndexOf('@') + 1 && !s.EndsWith('.');

    /// <summary>Mövcud olmayan istifadəçi üçün də eyni qədər vaxt sərf olunsun deyə.</summary>
    private static class DummyHash
    {
        public static readonly string Value = Passwords.Hash(Auth.NewToken());
    }
}
