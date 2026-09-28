using System.Text.Json;
using Npgsql;

namespace IdeaFlow;

/// <summary>Layihə sənədləri və iştirakçı söhbəti.</summary>
public static class Extras
{
    private static readonly string[] AllowedExt =
        [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".txt"];

    private const long MaxFileSize = 15 * 1024 * 1024; // 15 MB

    public static string UploadDir =>
        Path.Combine(Environment.GetEnvironmentVariable("DATA_DIR") ?? "/data", "uploads");

    public static void Map(WebApplication app)
    {
        // ------------------------------------------------------------ söhbət
        app.MapPost("/api/projects/{id:int}/messages", async (HttpContext ctx, int id, JsonElement body) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            var text = Api.Str(body, "body", 4000);
            if (text.Length == 0) return Api.Err(400, "e_empty");

            await using var c = await Db.OpenAsync();
            if (!await IsParticipantAsync(c, id, u!.Id, u.Role)) return Api.Err(403, "e_notParticipant");

            await using var cmd = new NpgsqlCommand(
                "insert into messages (project_id, user_id, body) values (@p, @u, @b) returning id", c);
            cmd.Parameters.AddWithValue("p", id);
            cmd.Parameters.AddWithValue("u", u.Id);
            cmd.Parameters.AddWithValue("b", text);
            var msgId = (int)(await cmd.ExecuteScalarAsync())!;
            return Results.Json(new { ok = true, id = msgId });
        });

        // ---------------------------------------------------------- sənədlər
        app.MapPost("/api/projects/{id:int}/documents", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;
            if (!ctx.Request.HasFormContentType) return Api.Err(400, "e_form");

            var form = await ctx.Request.ReadFormAsync();
            var file = form.Files.GetFile("file");
            if (file is null || file.Length == 0) return Api.Err(400, "e_noFile");
            if (file.Length > MaxFileSize) return Api.Err(413, "e_bigFile");

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedExt.Contains(ext)) return Api.Err(415, "e_fileType");

            var kind = (form["kind"].ToString() ?? "other").Trim();
            if (kind is not ("nda" or "patent" or "contract" or "cert" or "other")) kind = "other";

            await using var c = await Db.OpenAsync();
            if (!await IsParticipantAsync(c, id, u!.Id, u.Role)) return Api.Err(403, "e_notParticipant");

            Directory.CreateDirectory(UploadDir);
            // Fayl diskə yalnız GUID adı ilə yazılır — orijinal ad bazada qalır.
            // Beləcə istifadəçinin göndərdiyi ad heç vaxt fayl sisteminə düşmür.
            var stored = Guid.NewGuid().ToString("n") + ext;
            var path = Path.Combine(UploadDir, stored);
            await using (var fs = File.Create(path)) await file.CopyToAsync(fs);

            await using var cmd = new NpgsqlCommand("""
                insert into documents (project_id, kind, orig_name, stored_name, size, mime, uploaded_by)
                values (@p, @k, @o, @s, @z, @m, @u) returning id
                """, c);
            cmd.Parameters.AddWithValue("p", id);
            cmd.Parameters.AddWithValue("k", kind);
            cmd.Parameters.AddWithValue("o", SafeName(file.FileName));
            cmd.Parameters.AddWithValue("s", stored);
            cmd.Parameters.AddWithValue("z", file.Length);
            cmd.Parameters.AddWithValue("m", file.ContentType ?? "");
            cmd.Parameters.AddWithValue("u", u.Id);
            var docId = (int)(await cmd.ExecuteScalarAsync())!;

            await Audit.LogAsync(c, u.Id, "doc_upload", "document", docId, new { project = id, kind }, ctx);
            return Results.Json(new { ok = true, id = docId });
        });

        app.MapGet("/api/documents/{id:int}/download", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            await using var cmd = new NpgsqlCommand(
                "select project_id, orig_name, stored_name, mime from documents where id = @id", c);
            cmd.Parameters.AddWithValue("id", id);

            int projectId = 0; string orig = "", stored = "", mime = "";
            await using (var r = await cmd.ExecuteReaderAsync())
            {
                if (!await r.ReadAsync()) return Api.Err(404, "e_notFound");
                projectId = r.GetInt32(0); orig = r.GetString(1); stored = r.GetString(2); mime = r.GetString(3);
            }
            if (!await IsParticipantAsync(c, projectId, u!.Id, u.Role)) return Api.Err(403, "e_notParticipant");

            var path = Path.Combine(UploadDir, stored);
            if (!File.Exists(path)) return Api.Err(404, "e_fileGone");

            // Brauzer sənədi səhifə kimi icra etməsin deyə həmişə yükləmə kimi verilir.
            return Results.File(path, string.IsNullOrEmpty(mime) ? "application/octet-stream" : mime,
                fileDownloadName: orig);
        });

        app.MapDelete("/api/documents/{id:int}", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            await using var get = new NpgsqlCommand(
                "select d.uploaded_by, d.stored_name, p.author_id from documents d " +
                "join projects p on p.id = d.project_id where d.id = @id", c);
            get.Parameters.AddWithValue("id", id);

            int uploader = 0, authorId = 0; string stored = "";
            await using (var r = await get.ExecuteReaderAsync())
            {
                if (!await r.ReadAsync()) return Api.Err(404, "e_notFound");
                uploader = r.GetInt32(0); stored = r.GetString(1); authorId = r.GetInt32(2);
            }
            if (u!.Role != "admin" && uploader != u.Id && authorId != u.Id) return Api.Err(403, "e_forbidden");

            await using (var del = new NpgsqlCommand("delete from documents where id = @id", c))
            {
                del.Parameters.AddWithValue("id", id);
                await del.ExecuteNonQueryAsync();
            }
            var path = Path.Combine(UploadDir, stored);
            if (File.Exists(path)) File.Delete(path);

            await Audit.LogAsync(c, u.Id, "doc_delete", "document", id, null, ctx);
            return Results.Json(new { ok = true });
        });
    }

    // ---------------------------------------------------------------- oxu
    public static async Task<List<object>> DocumentsAsync(NpgsqlConnection c, int projectId)
    {
        await using var cmd = new NpgsqlCommand("""
            select d.id, d.kind, d.orig_name, d.size, d.created_at, u.full_name
            from documents d join users u on u.id = d.uploaded_by
            where d.project_id = @p order by d.id desc
            """, c);
        cmd.Parameters.AddWithValue("p", projectId);
        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new
            {
                id = r.GetInt32(0), kind = r.GetString(1), name = r.GetString(2),
                size = r.GetInt64(3), createdAt = r.GetDateTime(4), by = r.GetString(5),
            });
        return list;
    }

    public static async Task<List<object>> MessagesAsync(NpgsqlConnection c, int projectId)
    {
        await using var cmd = new NpgsqlCommand("""
            select m.id, m.body, m.created_at, u.id, u.full_name, u.role
            from messages m join users u on u.id = m.user_id
            where m.project_id = @p order by m.id limit 300
            """, c);
        cmd.Parameters.AddWithValue("p", projectId);
        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new
            {
                id = r.GetInt32(0), body = r.GetString(1), createdAt = r.GetDateTime(2),
                userId = r.GetInt32(3), userName = r.GetString(4), role = r.GetString(5),
            });
        return list;
    }

    /// <summary>
    /// Sənəd və söhbət kataloqdakı hər kəsə deyil, yalnız iştirakçılara açıqdır:
    /// müəllif, admin və layihəyə təklif/investisiya/sifariş vermiş tərəflər.
    /// </summary>
    public static async Task<bool> IsParticipantAsync(NpgsqlConnection c, int projectId, int userId, string role)
    {
        if (role == "admin") return true;
        await using var cmd = new NpgsqlCommand("""
            select exists (
              select 1 from projects p where p.id = @p and p.author_id = @u
              union all
              select 1 from offers      where project_id = @p and maker_id    = @u and status <> 'withdrawn'
              union all
              select 1 from investments where project_id = @p and investor_id = @u and status <> 'withdrawn'
              union all
              select 1 from preorders   where project_id = @p and seller_id   = @u
            )
            """, c);
        cmd.Parameters.AddWithValue("p", projectId);
        cmd.Parameters.AddWithValue("u", userId);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }

    private static string SafeName(string name)
    {
        var baseName = Path.GetFileName(name);
        foreach (var ch in Path.GetInvalidFileNameChars()) baseName = baseName.Replace(ch, '_');
        return baseName.Length <= 180 ? baseName : baseName[^180..];
    }
}
