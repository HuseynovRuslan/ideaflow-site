using System.Net;
using System.Text.Json;
using Npgsql;

namespace IdeaFlow;

/// <summary>
/// Qeydiyyatsız açılan layihə səhifəsi (/p/{id}). Müəllif linki sosial şəbəkədə
/// paylaşır, adi insan «Mən alardım» deyir — bu, tələbin platformadan kənar sübutudur.
/// Yalnız kataloqda açıq olan mərhələlər (demand və sonrası) göstərilir.
/// </summary>
public static class PublicApi
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/public/projects/{id:int}", async (int id) =>
        {
            await using var c = await Db.OpenAsync();
            var p = await LoadAsync(c, id);
            return p is null ? Api.Err(404, "e_notFound") : Results.Json(p);
        });

        app.MapPost("/api/public/projects/{id:int}/interest", async (HttpContext ctx, int id, JsonElement body) =>
        {
            // Botlar gizli «website» sahəsini doldurur — insan onu görmür. Uğur kimi
            // cavab veririk ki, bot fərqi anlamasın.
            if (Api.Str(body, "website", 200).Length > 0) return Results.Json(new { ok = true });

            var name = Api.Str(body, "name", 80);
            var contact = Api.Str(body, "contact", 120);
            var note = Api.Str(body, "note", 500);
            var qty = Math.Clamp(Api.Int(body, "qty") ?? 1, 1, 100);
            if (name.Length < 2) return Api.Err(400, "e_name");
            if (!IsContact(contact)) return Api.Err(400, "e_contact");

            await using var c = await Db.OpenAsync();
            var (authorId, status) = await ProjectsApi.LoadOwnerAsync(c, id);
            if (authorId == 0 || !Rules.PublicStatuses.Contains(status)) return Api.Err(404, "e_notFound");

            // Eyni kontakt ikinci dəfə yazanda yeni sətir yaranmır, miqdar yenilənir —
            // tələb rəqəmi bir nəfərin təkrar basması ilə şişməsin.
            await using var cmd = new NpgsqlCommand("""
                insert into interests (project_id, name, contact, qty, note, ip)
                values (@p, @n, @c, @q, @no, @ip)
                on conflict (project_id, lower(contact))
                do update set name = excluded.name, qty = excluded.qty, note = excluded.note
                """, c);
            cmd.Parameters.AddWithValue("p", id);
            cmd.Parameters.AddWithValue("n", name);
            cmd.Parameters.AddWithValue("c", contact);
            cmd.Parameters.AddWithValue("q", qty);
            cmd.Parameters.AddWithValue("no", note);
            cmd.Parameters.AddWithValue("ip", Auth.ClientIp(ctx));
            await cmd.ExecuteNonQueryAsync();

            await Audit.LogAsync(c, null, "interest", "project", id, new { qty }, ctx);
            var p = await LoadAsync(c, id);
            return Results.Json(new { ok = true, interest = p?["interest"], people = p?["people"] });
        }).RequireRateLimiting("public");

        // Paylaşılan link: /p/{id}. Səhifə eyni SPA-dır, amma sosial şəbəkə önizləməsi
        // (WhatsApp, Telegram, Facebook) JS icra etmir — ona görə başlıq və təsviri
        // serverdə OG teqləri kimi index.html-ə yerləşdiririk.
        app.MapGet("/p/{id:int}", async (HttpContext ctx, int id, IWebHostEnvironment env) =>
        {
            var file = Path.Combine(env.WebRootPath, "index.html");
            var html = await File.ReadAllTextAsync(file);

            await using var c = await Db.OpenAsync();
            var p = await LoadAsync(c, id);
            if (p is not null)
            {
                var title = WebUtility.HtmlEncode((string)p["title"]! + " — IdeaFlow");
                var descr = (string)p["descr"]!;
                if (descr.Length > 180) descr = descr[..180].TrimEnd() + "…";
                descr = WebUtility.HtmlEncode(descr);
                var url = WebUtility.HtmlEncode($"{ctx.Request.Scheme}://{ctx.Request.Host}/p/{id}");
                var meta = $"""
                    <title>{title}</title>
                    <meta name="description" content="{descr}">
                    <meta property="og:type" content="product">
                    <meta property="og:title" content="{title}">
                    <meta property="og:description" content="{descr}">
                    <meta property="og:url" content="{url}">
                    <meta name="twitter:card" content="summary">
                    """;
                html = html.Replace("<title>IdeaFlow</title>", meta);
            }
            ctx.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            return Results.Content(html, "text/html; charset=utf-8");
        });
    }

    /// <summary>Açıq səhifə üçün layihə. Açıq mərhələdə deyilsə null.</summary>
    private static async Task<Dictionary<string, object?>?> LoadAsync(NpgsqlConnection c, int id)
    {
        await using var cmd = new NpgsqlCommand("""
            select p.id, p.title, p.descr, p.category, p.status, p.price, p.rating, u.full_name,
                   coalesce((select sum(qty) from preorders where project_id = p.id), 0),
                   coalesce((select sum(qty) from interests where project_id = p.id), 0),
                   (select count(*) from interests where project_id = p.id)
            from projects p join users u on u.id = p.author_id
            where p.id = @id and p.status = any(@st)
            """, c);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", Rules.PublicStatuses);
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;
        return new Dictionary<string, object?>
        {
            ["id"] = r.GetInt32(0),
            ["title"] = r.GetString(1),
            ["descr"] = r.GetString(2),
            ["category"] = r.GetString(3),
            ["status"] = r.GetString(4),
            ["price"] = r.IsDBNull(5) ? null : r.GetDecimal(5),
            ["rating"] = r.GetInt32(6),
            ["authorName"] = r.GetString(7),
            ["preorders"] = (int)r.GetInt64(8),
            ["interest"] = (int)r.GetInt64(9),
            ["people"] = (int)r.GetInt64(10),
        };
    }

    /// <summary>Müəllif və admin üçün — kim maraq bildirib.</summary>
    public static async Task<List<object>> InterestsAsync(NpgsqlConnection c, int projectId)
    {
        await using var cmd = new NpgsqlCommand("""
            select id, name, contact, qty, note, created_at from interests
            where project_id = @p order by id desc limit 500
            """, c);
        cmd.Parameters.AddWithValue("p", projectId);
        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new
            {
                id = r.GetInt32(0), name = r.GetString(1), contact = r.GetString(2),
                qty = r.GetInt32(3), note = r.GetString(4), createdAt = r.GetDateTime(5),
            });
        return list;
    }

    /// <summary>E-poçt və ya telefon (ən azı 7 rəqəm).</summary>
    private static bool IsContact(string s)
    {
        if (s.Length < 5) return false;
        if (s.Contains('@'))
            return s.Count(ch => ch == '@') == 1 && s.IndexOf('@') > 0 && s.LastIndexOf('.') > s.IndexOf('@') + 1;
        var digits = s.Count(char.IsDigit);
        return digits >= 7 && s.All(ch => char.IsDigit(ch) || ch is '+' or ' ' or '-' or '(' or ')');
    }
}
