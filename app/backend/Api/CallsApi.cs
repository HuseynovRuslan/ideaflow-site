using System.Text.Json;
using Npgsql;

namespace IdeaFlow;

/// <summary>
/// Elanlar — icma, təşkilat və ya şirkət konkret mövzuda ideya axtarır
/// («Novxanı kəndinin şevronları» kimi). Elanı yalnız admin yaradır və idarə edir.
///
/// Elan səhifəsi (/elan/{id}) qeydiyyatsız açılır — link sosial şəbəkədə paylaşılır.
/// İdeya göndərmək üçün hesab lazımdır, amma admin təsdiqini gözləmək lazım DEYİL:
/// insan linkə basır, qeydiyyatdan keçir və elə həmin an ideyasını göndərir. Təsdiqlənməmiş
/// hesabın ideyası saxlanılır, lakin hamıya yalnız hesab təsdiq olunandan sonra görünür —
/// spam hesablar elanın səhifəsini doldura bilməsin.
/// </summary>
public static class CallsApi
{
    // Eskiz üçün yalnız şəkil və PDF. Content-Type istifadəçinin dediyindən yox,
    // uzantıdan təyin olunur və faylın ilk baytları ilə yoxlanılır.
    private static readonly Dictionary<string, string> FileTypes = new()
    {
        [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png",
        [".webp"] = "image/webp", [".pdf"] = "application/pdf",
    };

    private const long MaxFileSize = 10 * 1024 * 1024; // 10 MB
    public const int MaxEntriesPerUser = 5;

    // Son tarix Bakı vaxtı ilə günün sonuna qədər qüvvədədir.
    private const string Accepting =
        "(c.status = 'open' and (c.deadline is null or c.deadline >= (now() at time zone 'Asia/Baku')::date))";

    // Hamıya görünən ideya: gizlədilməyib və müəllifin hesabı təsdiqlənib.
    private const string VisibleEntry = "(not e.hidden and eu.status = 'active')";

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/api/calls");

        // ------------------------------------------------------------ siyahı
        g.MapGet("", async (HttpContext ctx) =>
        {
            var admin = IsAdmin(Api.User(ctx));
            await using var c = await Db.OpenAsync();
            // total — gizlədilmiş və təsdiq gözləyənlər daxil; yalnız adminə qaytarılır.
            await using var cmd = new NpgsqlCommand($"""
                select c.id, c.title, c.organizer, c.descr, c.emoji, c.color, c.deadline, c.status,
                       {Accepting}, c.created_at, coalesce(v.ideas, 0), coalesce(v.people, 0),
                       (select count(*) from call_entries a where a.call_id = c.id)
                from calls c
                left join (select e.call_id, count(*) ideas, count(distinct e.user_id) people
                           from call_entries e join users eu on eu.id = e.user_id
                           where {VisibleEntry} group by 1) v on v.call_id = c.id
                order by 9 desc, c.id desc
                limit 100
                """, c);

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var descr = r.GetString(3);
                list.Add(new
                {
                    id = r.GetInt32(0), title = r.GetString(1), organizer = r.GetString(2),
                    excerpt = descr.Length > 220 ? descr[..220].TrimEnd() + "…" : descr,
                    emoji = r.GetString(4), color = r.GetString(5), deadline = DateStr(r, 6),
                    status = r.GetString(7), accepting = r.GetBoolean(8), createdAt = r.GetDateTime(9),
                    ideas = (int)r.GetInt64(10), people = (int)r.GetInt64(11),
                    total = admin ? (int?)r.GetInt64(12) : null,
                });
            }
            return Results.Json(list);
        });

        // ------------------------------------------------------------- detal
        g.MapGet("/{id:int}", async (HttpContext ctx, int id) =>
        {
            var u = Api.User(ctx);
            var admin = IsAdmin(u);

            await using var c = await Db.OpenAsync();
            var call = await LoadAsync(c, id);
            if (call is null) return Api.Err(404, "e_notFound");
            var entriesPublic = (bool)call["entriesPublic"]!;

            // Admin hamısını görür; istifadəçi öz ideyalarını həmişə görür;
            // qalanları — yalnız elan ideyaları açıq göstərirsə və ideya hamıya görünəndirsə.
            await using var cmd = new NpgsqlCommand($"""
                select e.id, e.title, e.descr, e.file_name, e.hidden, e.created_at, e.user_id,
                       eu.full_name, eu.status, eu.email, eu.phone, {VisibleEntry}
                from call_entries e join users eu on eu.id = e.user_id
                where e.call_id = @id
                  and (@admin or e.user_id = @me or (@pub and {VisibleEntry}))
                order by e.id desc
                limit 500
                """, c);
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("admin", admin);
            cmd.Parameters.AddWithValue("me", u?.Id ?? 0);
            cmd.Parameters.AddWithValue("pub", entriesPublic);

            var entries = new List<object>();
            var mine = 0;
            await using (var r = await cmd.ExecuteReaderAsync())
            {
                while (await r.ReadAsync())
                {
                    var eid = r.GetInt32(0);
                    var own = u is not null && r.GetInt32(6) == u.Id;
                    if (own) mine++;
                    var file = r.IsDBNull(3) ? null : r.GetString(3);
                    entries.Add(new
                    {
                        id = eid, title = r.GetString(1), descr = r.GetString(2),
                        createdAt = r.GetDateTime(5), authorName = r.GetString(7),
                        file = file is null ? null : new
                        {
                            kind = file.EndsWith(".pdf", StringComparison.Ordinal) ? "pdf" : "image",
                            url = $"/api/calls/entries/{eid}/file",
                        },
                        mine = own,
                        visible = r.GetBoolean(11),
                        // Gizlədilmə və təsdiq vəziyyəti yalnız müəllifin özünə və adminə görünür.
                        hidden = (own || admin) && r.GetBoolean(4),
                        pending = (own || admin) && r.GetString(8) != "active",
                        // Kontakt şəxsi məlumatdır — yalnız admin (təşkilatçı qalibi tapsın deyə).
                        contact = admin ? new { email = r.GetString(9), phone = r.GetString(10) } : null,
                    });
                }
            }

            var accepting = (bool)call["accepting"]!;
            var signedIn = u is not null && u.Status is "active" or "pending";
            // Göndərə bilməmə səbəbi interfeysdə uyğun mətni seçmək üçündür.
            string? block = !accepting ? "closed"
                : u is null ? "login"
                : !signedIn ? "account"
                : mine >= MaxEntriesPerUser ? "limit"
                : null;

            call["entries"] = entries;
            call["mine"] = mine;
            call["limit"] = MaxEntriesPerUser;
            call["can"] = new { submit = block is null, block, edit = admin };
            return Results.Json(call);
        });

        // ----------------------------------------------------- admin: yaratmaq
        g.MapPost("", async (HttpContext ctx, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            var f = ReadFields(body, creating: true);
            if (f.Error is not null) return Api.Err(400, f.Error);

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                insert into calls (title, organizer, descr, emoji, color, deadline, status, entries_public, created_by)
                values (@t, @o, @d, @em, @co, @dl, @st, @pub, @by) returning id
                """, c);
            cmd.Parameters.AddWithValue("t", f.Title!);
            cmd.Parameters.AddWithValue("o", f.Organizer ?? "");
            cmd.Parameters.AddWithValue("d", f.Descr ?? "");
            cmd.Parameters.AddWithValue("em", f.Emoji ?? "📣");
            cmd.Parameters.AddWithValue("co", f.Color ?? "#FFEDD5");
            cmd.Parameters.Add(new NpgsqlParameter("dl", NpgsqlTypes.NpgsqlDbType.Date)
                { Value = f.Deadline is { } dl ? (object)dl : DBNull.Value });
            cmd.Parameters.AddWithValue("st", f.Status ?? "open");
            cmd.Parameters.AddWithValue("pub", f.EntriesPublic ?? true);
            cmd.Parameters.AddWithValue("by", u!.Id);
            var id = (int)(await cmd.ExecuteScalarAsync())!;

            await Audit.LogAsync(c, u.Id, "call_create", "call", id, new { title = f.Title }, ctx);
            return Results.Json(new { ok = true, id });
        });

        // ---------------------------------------------------- admin: redaktə
        // Yalnız göndərilən sahələr dəyişir — siyahıdakı «Bağla» düyməsi yalnız status göndərir.
        g.MapPatch("/{id:int}", async (HttpContext ctx, int id, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            var f = ReadFields(body, creating: false);
            if (f.Error is not null) return Api.Err(400, f.Error);

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                update calls set
                  title          = coalesce(@t, title),
                  organizer      = coalesce(@o, organizer),
                  descr          = coalesce(@d, descr),
                  emoji          = coalesce(@em, emoji),
                  color          = coalesce(@co, color),
                  deadline       = case when @dlset then @dl else deadline end,
                  status         = coalesce(@st, status),
                  entries_public = coalesce(@pub, entries_public),
                  updated_at     = now()
                where id = @id
                """, c);
            cmd.Parameters.Add(Text("t", f.Title));
            cmd.Parameters.Add(Text("o", f.Organizer));
            cmd.Parameters.Add(Text("d", f.Descr));
            cmd.Parameters.Add(Text("em", f.Emoji));
            cmd.Parameters.Add(Text("co", f.Color));
            cmd.Parameters.AddWithValue("dlset", f.DeadlineSet);
            cmd.Parameters.Add(new NpgsqlParameter("dl", NpgsqlTypes.NpgsqlDbType.Date)
                { Value = f.Deadline is { } dl ? (object)dl : DBNull.Value });
            cmd.Parameters.Add(Text("st", f.Status));
            cmd.Parameters.Add(new NpgsqlParameter("pub", NpgsqlTypes.NpgsqlDbType.Boolean)
                { Value = f.EntriesPublic is { } pub ? (object)pub : DBNull.Value });
            cmd.Parameters.AddWithValue("id", id);
            if (await cmd.ExecuteNonQueryAsync() == 0) return Api.Err(404, "e_notFound");

            await Audit.LogAsync(c, u!.Id, "call_edit", "call", id, null, ctx);
            return Results.Json(new { ok = true });
        });

        // ------------------------------------------------------ admin: silmək
        g.MapDelete("/{id:int}", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var files = new List<string>();
            await using (var get = new NpgsqlCommand(
                "select file_name from call_entries where call_id = @id and file_name is not null", c))
            {
                get.Parameters.AddWithValue("id", id);
                await using var r = await get.ExecuteReaderAsync();
                while (await r.ReadAsync()) files.Add(r.GetString(0));
            }
            await using (var del = new NpgsqlCommand("delete from calls where id = @id", c))
            {
                del.Parameters.AddWithValue("id", id);
                if (await del.ExecuteNonQueryAsync() == 0) return Api.Err(404, "e_notFound");
            }
            foreach (var name in files) DeleteFile(name);

            await Audit.LogAsync(c, u!.Id, "call_delete", "call", id, new { files = files.Count }, ctx);
            return Results.Json(new { ok = true });
        });

        // ----------------------------------------------------- ideya göndərmək
        g.MapPost("/{id:int}/entries", async (HttpContext ctx, int id) =>
        {
            var u = Api.User(ctx);
            if (u is null) return Api.Err(401, "e_auth");
            if (u.Status is not ("active" or "pending")) return Api.Err(403, "e_forbidden");
            if (!ctx.Request.HasFormContentType) return Api.Err(400, "e_form");

            var form = await ctx.Request.ReadFormAsync();
            var title = Clip(form["title"].ToString(), 120);
            var descr = Clip(form["descr"].ToString(), 3000);
            if (title.Length < 3) return Api.Err(400, "e_title");

            var file = form.Files.GetFile("file");
            string? ext = null;
            if (file is { Length: > 0 })
            {
                if (file.Length > MaxFileSize) return Api.Err(413, "e_entryBigFile");
                ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!FileTypes.ContainsKey(ext) || !await SignatureOkAsync(file, ext))
                    return Api.Err(415, "e_entryFileType");
            }

            await using var c = await Db.OpenAsync();
            await using (var chk = new NpgsqlCommand($"""
                select {Accepting},
                       (select count(*) from call_entries where call_id = c.id and user_id = @u)
                from calls c where c.id = @id
                """, c))
            {
                chk.Parameters.AddWithValue("id", id);
                chk.Parameters.AddWithValue("u", u.Id);
                await using var r = await chk.ExecuteReaderAsync();
                if (!await r.ReadAsync()) return Api.Err(404, "e_notFound");
                if (!r.GetBoolean(0)) return Api.Err(400, "e_callClosed");
                if (r.GetInt64(1) >= MaxEntriesPerUser) return Api.Err(400, "e_entryLimit");
            }

            // Fayl diskə yalnız GUID adı ilə yazılır — istifadəçinin verdiyi ad fayl sisteminə düşmür.
            string? stored = null;
            if (ext is not null)
            {
                Directory.CreateDirectory(Extras.UploadDir);
                stored = "call-" + Guid.NewGuid().ToString("n") + ext;
                await using var fs = File.Create(Path.Combine(Extras.UploadDir, stored));
                await file!.CopyToAsync(fs);
            }

            await using var ins = new NpgsqlCommand("""
                insert into call_entries (call_id, user_id, title, descr, file_name, file_size)
                values (@c, @u, @t, @d, @f, @z) returning id
                """, c);
            ins.Parameters.AddWithValue("c", id);
            ins.Parameters.AddWithValue("u", u.Id);
            ins.Parameters.AddWithValue("t", title);
            ins.Parameters.AddWithValue("d", descr);
            ins.Parameters.Add(Text("f", stored));
            ins.Parameters.AddWithValue("z", stored is null ? 0L : file!.Length);
            var eid = (int)(await ins.ExecuteScalarAsync())!;

            await Audit.LogAsync(c, u.Id, "call_entry", "call", id, new { entry = eid, file = stored is not null }, ctx);
            return Results.Json(new { ok = true, id = eid, visible = u.Status == "active" });
        }).RequireRateLimiting("public");

        // ------------------------------------------------------- ideyanı silmək
        // Müəllif öz ideyasını istənilən vaxt geri götürə bilər; admin hər ideyanı silə bilər.
        g.MapDelete("/entries/{eid:int}", async (HttpContext ctx, int eid) =>
        {
            var u = Api.User(ctx);
            if (u is null) return Api.Err(401, "e_auth");

            await using var c = await Db.OpenAsync();
            int owner = 0, callId = 0; string? stored = null;
            await using (var get = new NpgsqlCommand(
                "select user_id, call_id, file_name from call_entries where id = @id", c))
            {
                get.Parameters.AddWithValue("id", eid);
                await using var r = await get.ExecuteReaderAsync();
                if (!await r.ReadAsync()) return Api.Err(404, "e_notFound");
                owner = r.GetInt32(0); callId = r.GetInt32(1); stored = r.IsDBNull(2) ? null : r.GetString(2);
            }
            if (!IsAdmin(u) && owner != u.Id) return Api.Err(403, "e_forbidden");

            await using (var del = new NpgsqlCommand("delete from call_entries where id = @id", c))
            {
                del.Parameters.AddWithValue("id", eid);
                await del.ExecuteNonQueryAsync();
            }
            if (stored is not null) DeleteFile(stored);

            await Audit.LogAsync(c, u.Id, "call_entry_delete", "call", callId, new { entry = eid }, ctx);
            return Results.Json(new { ok = true });
        });

        // ------------------------------------------- admin: ideyanı gizlətmək
        g.MapPost("/entries/{eid:int}/hidden", async (HttpContext ctx, int eid, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx, "admin");
            if (fail is not null) return fail;
            var hidden = body.TryGetProperty("hidden", out var h) && h.ValueKind == JsonValueKind.True;

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand(
                "update call_entries set hidden = @h where id = @id returning call_id", c);
            cmd.Parameters.AddWithValue("h", hidden);
            cmd.Parameters.AddWithValue("id", eid);
            if (await cmd.ExecuteScalarAsync() is not int callId) return Api.Err(404, "e_notFound");

            await Audit.LogAsync(c, u!.Id, hidden ? "call_entry_hide" : "call_entry_show", "call", callId,
                new { entry = eid }, ctx);
            return Results.Json(new { ok = true, hidden });
        });

        // --------------------------------------------------------- eskiz faylı
        g.MapGet("/entries/{eid:int}/file", async (HttpContext ctx, int eid) =>
        {
            var u = Api.User(ctx);

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand($"""
                select e.user_id, e.file_name, {VisibleEntry} and c.entries_public
                from call_entries e
                join users eu on eu.id = e.user_id
                join calls c on c.id = e.call_id
                where e.id = @id
                """, c);
            cmd.Parameters.AddWithValue("id", eid);

            int owner; string? stored; bool open;
            await using (var r = await cmd.ExecuteReaderAsync())
            {
                if (!await r.ReadAsync()) return Api.Err(404, "e_notFound");
                owner = r.GetInt32(0); stored = r.IsDBNull(1) ? null : r.GetString(1); open = r.GetBoolean(2);
            }
            // Görünməyən ideyanın faylı üçün də 404 — varlığı belə bilinməsin.
            if (stored is null || !(open || IsAdmin(u) || owner == u?.Id)) return Api.Err(404, "e_notFound");

            var path = Path.Combine(Extras.UploadDir, stored);
            if (!File.Exists(path)) return Api.Err(404, "e_fileGone");
            var ext = Path.GetExtension(stored);

            // İstifadəçi faylı brauzerdə heç vaxt səhifə kimi icra olunmasın.
            ctx.Response.Headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
            ctx.Response.Headers["Cache-Control"] = "private, max-age=600";
            return ext == ".pdf"
                ? Results.File(path, FileTypes[ext], fileDownloadName: $"ideya-{eid}.pdf")
                : Results.File(path, FileTypes[ext]);
        });

        // ------------------------------------------------------ paylaşılan link
        // /elan/{id} eyni SPA-dır; sosial şəbəkə önizləməsi JS icra etmədiyi üçün
        // elanın adı və təsviri serverdə OG teqləri kimi yerləşdirilir.
        app.MapGet("/elan/{id:int}", async (HttpContext ctx, int id, IWebHostEnvironment env) =>
        {
            var html = await File.ReadAllTextAsync(Path.Combine(env.WebRootPath, "index.html"));
            await using var c = await Db.OpenAsync();
            var call = await LoadAsync(c, id);
            if (call is not null)
            {
                var url = $"{ctx.Request.Scheme}://{ctx.Request.Host}/elan/{id}";
                html = PageMeta.Inject(html, $"📣 {call["title"]} — IdeaFlow", (string)call["descr"]!, url, "website");
            }
            ctx.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            return Results.Content(html, "text/html; charset=utf-8");
        });
    }

    // ------------------------------------------------------------ köməkçilər
    private static bool IsAdmin(CurrentUser? u) => u is { Role: "admin", Status: "active" };

    private static async Task<Dictionary<string, object?>?> LoadAsync(NpgsqlConnection c, int id)
    {
        await using var cmd = new NpgsqlCommand($"""
            select c.id, c.title, c.organizer, c.descr, c.emoji, c.color, c.deadline, c.status,
                   {Accepting}, c.entries_public, c.created_at,
                   (select count(*) from call_entries e join users eu on eu.id = e.user_id
                    where e.call_id = c.id and {VisibleEntry}),
                   (select count(distinct e.user_id) from call_entries e join users eu on eu.id = e.user_id
                    where e.call_id = c.id and {VisibleEntry})
            from calls c where c.id = @id
            """, c);
        cmd.Parameters.AddWithValue("id", id);
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;
        return new Dictionary<string, object?>
        {
            ["id"] = r.GetInt32(0),
            ["title"] = r.GetString(1),
            ["organizer"] = r.GetString(2),
            ["descr"] = r.GetString(3),
            ["emoji"] = r.GetString(4),
            ["color"] = r.GetString(5),
            ["deadline"] = DateStr(r, 6),
            ["status"] = r.GetString(7),
            ["accepting"] = r.GetBoolean(8),
            ["entriesPublic"] = r.GetBoolean(9),
            ["createdAt"] = r.GetDateTime(10),
            ["ideas"] = (int)r.GetInt64(11),
            ["people"] = (int)r.GetInt64(12),
        };
    }

    /// <summary>Tarix «2026-11-30» kimi sətir gedir — saat qurşağına görə bir gün sürüşməsin.</summary>
    private static string? DateStr(NpgsqlDataReader r, int i) =>
        r.IsDBNull(i) ? null : r.GetFieldValue<DateOnly>(i).ToString("yyyy-MM-dd");

    private sealed record Fields(
        string? Title, string? Organizer, string? Descr, string? Emoji, string? Color,
        bool DeadlineSet, DateOnly? Deadline, string? Status, bool? EntriesPublic, string? Error);

    /// <summary>Elan sahələri. null — «göndərilməyib, dəyişmə» (redaktədə).</summary>
    private static Fields ReadFields(JsonElement b, bool creating)
    {
        string? S(string name, int max) =>
            b.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? Clip(v.GetString()!, max) : null;

        var title = S("title", 160);
        if ((creating || title is not null) && (title ?? "").Length < 3) return Err("e_title");

        var emoji = S("emoji", 16);
        if (emoji is { Length: 0 }) emoji = "📣";

        var color = S("color", 7);
        if (color is not null && !System.Text.RegularExpressions.Regex.IsMatch(color, "^#[0-9A-Fa-f]{6}$"))
            return Err("e_callColor");

        var status = S("status", 10);
        if (status is not null and not ("open" or "closed")) return Err("e_callStatus");

        var deadlineSet = b.TryGetProperty("deadline", out var dv);
        DateOnly? deadline = null;
        if (deadlineSet && dv.ValueKind == JsonValueKind.String && dv.GetString()!.Trim().Length > 0)
        {
            if (!DateOnly.TryParseExact(dv.GetString()!.Trim(), "yyyy-MM-dd", out var d)) return Err("e_callDeadline");
            deadline = d;
        }

        bool? pub = b.TryGetProperty("entriesPublic", out var pv) && pv.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? pv.GetBoolean() : null;

        return new Fields(title, S("organizer", 120), S("descr", 8000), emoji, color,
            deadlineSet, deadline, status, pub, null);

        static Fields Err(string key) => new(null, null, null, null, null, false, null, null, null, key);
    }

    private static string Clip(string s, int max)
    {
        s = s.Trim();
        return s.Length <= max ? s : s[..max];
    }

    private static NpgsqlParameter Text(string name, string? value) =>
        new(name, NpgsqlTypes.NpgsqlDbType.Text) { Value = (object?)value ?? DBNull.Value };

    /// <summary>Faylın ilk baytları uzantısına uyğundurmu (adı .png olan HTML qəbul edilməsin).</summary>
    private static async Task<bool> SignatureOkAsync(IFormFile file, string ext)
    {
        var head = new byte[12];
        await using var s = file.OpenReadStream();
        var n = await s.ReadAtLeastAsync(head, head.Length, throwOnEndOfStream: false);
        bool Starts(params byte[] sig) => n >= sig.Length && head.AsSpan(0, sig.Length).SequenceEqual(sig);
        return ext switch
        {
            ".jpg" or ".jpeg" => Starts(0xFF, 0xD8, 0xFF),
            ".png" => Starts(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
            ".webp" => n >= 12 && Starts(0x52, 0x49, 0x46, 0x46) && head.AsSpan(8, 4).SequenceEqual("WEBP"u8),
            ".pdf" => Starts(0x25, 0x50, 0x44, 0x46),
            _ => false,
        };
    }

    private static void DeleteFile(string stored)
    {
        try
        {
            var path = Path.Combine(Extras.UploadDir, Path.GetFileName(stored));
            if (File.Exists(path)) File.Delete(path);
        }
        catch (IOException) { /* fayl qalsa da baza sətri silinib — kritik deyil */ }
    }

    // ------------------------------------------------------------- ilk elan
    /// <summary>
    /// «Novxanı kəndinin şevronları» elanı yayımda BİR DƏFƏ yaradılır və bu, settings-də
    /// qeyd olunur. Admin sonra onu redaktə edə və ya silə bilər — silinsə, yenidən yaranmır.
    /// </summary>
    public static async Task SeedAsync(ILogger log)
    {
        const string key = "seed_call:novxani-shevron";
        await using var c = await Db.OpenAsync();
        await using (var done = new NpgsqlCommand("select 1 from settings where key = @k", c))
        {
            done.Parameters.AddWithValue("k", key);
            if (await done.ExecuteScalarAsync() is not null) return;
        }

        await using var tx = await c.BeginTransactionAsync();
        int id;
        await using (var ins = new NpgsqlCommand("""
            insert into calls (title, organizer, descr, emoji, color)
            values (@t, '', @d, '🛡️', '#E0F2FE') returning id
            """, c, tx))
        {
            ins.Parameters.AddWithValue("t", "Novxanı kəndinin şevronları");
            ins.Parameters.AddWithValue("d", NovxaniText);
            id = (int)(await ins.ExecuteScalarAsync())!;
        }
        await using (var mark = new NpgsqlCommand("insert into settings (key, value) values (@k, @v)", c, tx))
        {
            mark.Parameters.AddWithValue("k", key);
            mark.Parameters.AddWithValue("v", id.ToString());
            await mark.ExecuteNonQueryAsync();
        }
        await tx.CommitAsync();
        log.LogInformation("İlk elan yaradıldı: Novxanı kəndinin şevronları (#{Id})", id);
    }

    private const string NovxaniText = """
        Novxanı kəndi üçün şevron ideyaları toplayırıq. Şevron — geyimin qoluna və ya döşünə tikilən kiçik emblemdir. Ən yaxşı ideya kəndin simvoluna çevrilə bilər: onu idman komandalarının, könüllülərin, məktəblilərin və kənd tədbirlərinin iştirakçılarının geyimində görəcəyik.

        Necə iştirak etmək olar:
        1. «İdeyanı göndər» düyməsinə bas və qeydiyyatdan keç — 1 dəqiqə çəkir.
        2. İdeyana ad ver və qısa izah yaz: şevronda nə təsvir olunub və bu, Novxanı ilə necə bağlıdır.
        3. Eskizi yüklə — kağızda çəkib telefonla şəklini çəkmək də olar (JPG, PNG və ya PDF).

        Nəyə diqqət et:
        • Novxanını tanıdan motiv: məsələn, Xəzər sahili və dəniz, Abşeron bağları (üzüm, əncir, zeytun), kəndin adı.
        • Forma: dairə, qalxan və ya düzbucaqlı. Təxminən 8–10 sm ölçüdə də aydın oxunmalıdır.
        • Rənglər: 5-dən çox olmasın — sadə dizayn tikmədə daha yaxşı alınır.
        • İdeya sənin özünün olmalıdır: başqasının loqosunu və ya internetdən götürülmüş hazır şəkli göndərmə.

        Bir nəfər 5 ideyaya qədər göndərə bilər. Seçilən ideya IdeaFlow-da layihəyə çevrilib istehsalçıya təqdim oluna bilər — müəllif kimi sənin adın qeyd olunur.
        """;
}
