using System.Threading.RateLimiting;
using IdeaFlow;
using Microsoft.AspNetCore.RateLimiting;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// Lokal `dotnet run` üçün frontend qovluğu birbaşa verilir; Docker-də fayllar
// wwwroot-a kopyalanır, ona görə orada bu şərt işləmir.
var devWebRoot = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "frontend"));
if (Directory.Exists(devWebRoot) && !Directory.Exists(Path.Combine(builder.Environment.ContentRootPath, "wwwroot")))
    builder.Environment.WebRootPath = devWebRoot;

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // Login/qeydiyyat IP üzrə məhdudlaşır — parol sınaması ucuz olmasın.
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        Auth.ClientIp(ctx),
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 12,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
});

var app = builder.Build();
var log = app.Logger;

Db.Init(BuildConnectionString());
await Db.WaitForDatabaseAsync(TimeSpan.FromSeconds(60), log);
await Db.MigrateAsync();
await EnsureAdminAsync(log);
await CleanupSessionsAsync();

// ---------------------------------------------------------------- keş qaydaları
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api"))
    {
        ctx.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
    }
    else
    {
        // index.html heç vaxt keşlənmir — deploy edilən düzəliş telefonlarda
        // köhnə JS-lə ilişib qalmasın (psklub-da bu problem yaşanmışdı).
        ctx.Response.OnStarting(() =>
        {
            if ((ctx.Response.ContentType ?? "").Contains("text/html", StringComparison.OrdinalIgnoreCase))
                ctx.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            return Task.CompletedTask;
        });
    }
    await next();
});

// ------------------------------------------------------------ təhlükəsizlik
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["X-Content-Type-Options"] = "nosniff";
    h["X-Frame-Options"] = "DENY";
    h["Referrer-Policy"] = "same-origin";
    await next();
});

app.UseRateLimiter();

// Cari istifadəçi bir dəfə oxunur və endpoint-lərə ctx.Items ilə ötürülür.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api"))
        ctx.Items["user"] = await Auth.ResolveAsync(ctx);
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // Build addımı (məzmun-heşli fayl adları) yoxdur, ona görə uzunmüddətli keş
        // təhlükəlidir: deploy edilən JS telefonda köhnə qalardı. `no-cache` faylı
        // yerli saxlayır, amma hər dəfə ETag ilə yoxladır — dəyişməyibsə 304 gəlir.
        if (ctx.Context.Request.Path.StartsWithSegments("/assets"))
            ctx.Context.Response.Headers["Cache-Control"] = "no-cache";
    },
});

AuthApi.Map(app);
ProjectsApi.Map(app);
Deals.Map(app);
Extras.Map(app);
DashApi.Map(app);
AdminApi.Map(app);

app.MapGet("/api/health", () => Results.Json(new { ok = true, at = DateTime.UtcNow }));

// Hash routing istifadə olunur, amma birbaşa açılan naməlum yol da tətbiqə düşsün.
app.MapFallbackToFile("index.html");

app.Run();

// ------------------------------------------------------------------ qurğu
static string BuildConnectionString()
{
    var direct = Environment.GetEnvironmentVariable("PG_CONN");
    if (!string.IsNullOrWhiteSpace(direct)) return direct;

    var host = Environment.GetEnvironmentVariable("PGHOST") ?? "db";
    var port = Environment.GetEnvironmentVariable("PGPORT") ?? "5432";
    var user = Environment.GetEnvironmentVariable("PGUSER") ?? "ideaflow";
    var pass = Environment.GetEnvironmentVariable("PGPASSWORD") ?? "ideaflow";
    var name = Environment.GetEnvironmentVariable("PGDATABASE") ?? "ideaflow";
    return $"Host={host};Port={port};Username={user};Password={pass};Database={name};" +
           "Pooling=true;Minimum Pool Size=1;Maximum Pool Size=20";
}

/// <summary>
/// İlk admin mühit dəyişənlərindən yaradılır. Parol yalnız hesab yoxdursa qoyulur —
/// deploy zamanı mövcud adminin parolu təsadüfən sıfırlanmasın.
/// </summary>
static async Task EnsureAdminAsync(ILogger log)
{
    var email = (Environment.GetEnvironmentVariable("ADMIN_EMAIL") ?? "").Trim().ToLowerInvariant();
    var pass = Environment.GetEnvironmentVariable("ADMIN_PASSWORD") ?? "";
    if (email.Length == 0 || pass.Length < 8)
    {
        log.LogWarning("ADMIN_EMAIL/ADMIN_PASSWORD verilməyib — admin hesabı yaradılmadı");
        return;
    }

    await using var c = await Db.OpenAsync();
    await using var check = new NpgsqlCommand("select id, role, status from users where lower(email) = @e", c);
    check.Parameters.AddWithValue("e", email);

    int id = 0; string role = "", status = "";
    await using (var r = await check.ExecuteReaderAsync())
        if (await r.ReadAsync()) { id = r.GetInt32(0); role = r.GetString(1); status = r.GetString(2); }

    if (id == 0)
    {
        await using var ins = new NpgsqlCommand("""
            insert into users (email, pass_hash, full_name, role, status, approved_at)
            values (@e, @p, 'Administrator', 'admin', 'active', now())
            """, c);
        ins.Parameters.AddWithValue("e", email);
        ins.Parameters.AddWithValue("p", Passwords.Hash(pass));
        await ins.ExecuteNonQueryAsync();
        log.LogInformation("Admin hesabı yaradıldı: {Email}", email);
    }
    else if (role != "admin" || status != "active")
    {
        await using var upd = new NpgsqlCommand(
            "update users set role = 'admin', status = 'active' where id = @i", c);
        upd.Parameters.AddWithValue("i", id);
        await upd.ExecuteNonQueryAsync();
        log.LogInformation("Mövcud hesab admin kimi bərpa edildi: {Email}", email);
    }
}

static async Task CleanupSessionsAsync()
{
    await using var c = await Db.OpenAsync();
    await using var cmd = new NpgsqlCommand("delete from sessions where expires_at < now()", c);
    await cmd.ExecuteNonQueryAsync();
}
