using System.Security.Cryptography;
using System.Text;
using Npgsql;

namespace IdeaFlow;

/// <summary>Sessiyadan oxunmuş cari istifadəçi.</summary>
public sealed record CurrentUser(
    int Id, string Email, string FullName, string Role, string Status, int Trust, string Lang, string Company);

public static class Passwords
{
    // PBKDF2-HMAC-SHA256. OWASP-ın tövsiyə etdiyi iterasiya sayı (2024) — 600 000.
    // Yalnız login/qeydiyyatda hesablanır, sonra sessiya tokeni işləyir, ona görə
    // sorğu başına yük yaratmır.
    private const int Iterations = 600_000;
    private const int SaltSize = 16;
    private const int KeySize = 32;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return $"pbkdf2${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(key)}";
    }

    public static bool Verify(string hash, string password)
    {
        var parts = hash.Split('$');
        if (parts.Length != 4 || parts[0] != "pbkdf2") return false;
        if (!int.TryParse(parts[1], out var iters)) return false;

        byte[] salt, expected;
        try
        {
            salt = Convert.FromBase64String(parts[2]);
            expected = Convert.FromBase64String(parts[3]);
        }
        catch (FormatException) { return false; }

        var actual = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), salt, iters, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}

public static class Auth
{
    public const string CookieName = "ifsid";
    private static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);

    public static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
               .Replace("+", "-").Replace("/", "_").TrimEnd('=');

    public static async Task<string> CreateSessionAsync(NpgsqlConnection c, int userId, HttpContext ctx)
    {
        var token = NewToken();
        await using var cmd = new NpgsqlCommand(
            "insert into sessions (token, user_id, expires_at, ip, ua) values (@t,@u,@e,@i,@a)", c);
        cmd.Parameters.AddWithValue("t", token);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("e", DateTime.UtcNow + Lifetime);
        cmd.Parameters.AddWithValue("i", ClientIp(ctx));
        cmd.Parameters.AddWithValue("a", Truncate(ctx.Request.Headers.UserAgent.ToString(), 300));
        await cmd.ExecuteNonQueryAsync();
        return token;
    }

    public static void SetCookie(HttpContext ctx, string token)
    {
        ctx.Response.Cookies.Append(CookieName, token, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            // Proqram Caddy-nin arxasında HTTPS-də işləyir; lokal HTTP testi üçün
            // IDEAFLOW_INSECURE_COOKIE=1 ilə söndürülə bilər.
            Secure = Environment.GetEnvironmentVariable("IDEAFLOW_INSECURE_COOKIE") != "1",
            Path = "/",
            MaxAge = Lifetime,
        });
    }

    public static void ClearCookie(HttpContext ctx) =>
        ctx.Response.Cookies.Delete(CookieName, new CookieOptions { Path = "/" });

    /// <summary>Cookie-dəki tokeni istifadəçiyə çevirir. Bloklanmış istifadəçi null qaytarır.</summary>
    public static async Task<CurrentUser?> ResolveAsync(HttpContext ctx)
    {
        var token = ctx.Request.Cookies[CookieName];
        if (string.IsNullOrEmpty(token)) return null;

        await using var c = await Db.OpenAsync();
        await using var cmd = new NpgsqlCommand("""
            select u.id, u.email, u.full_name, u.role, u.status, u.trust, u.lang, u.company
            from sessions s join users u on u.id = s.user_id
            where s.token = @t and s.expires_at > now()
            """, c);
        cmd.Parameters.AddWithValue("t", token);

        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;

        var user = new CurrentUser(
            r.GetInt32(0), r.GetString(1), r.GetString(2), r.GetString(3),
            r.GetString(4), r.GetInt32(5), r.GetString(6), r.GetString(7));

        // Bloklanmış hesabın açıq sessiyası dərhal etibarsızdır — admin «blokla»
        // düyməsini basanda istifadəçi növbəti sorğuda çıxır.
        return user.Status == "blocked" ? null : user;
    }

    public static async Task DropSessionAsync(string token)
    {
        await using var c = await Db.OpenAsync();
        await using var cmd = new NpgsqlCommand("delete from sessions where token = @t", c);
        cmd.Parameters.AddWithValue("t", token);
        await cmd.ExecuteNonQueryAsync();
    }

    public static async Task DropAllSessionsAsync(NpgsqlConnection c, int userId)
    {
        await using var cmd = new NpgsqlCommand("delete from sessions where user_id = @u", c);
        cmd.Parameters.AddWithValue("u", userId);
        await cmd.ExecuteNonQueryAsync();
    }

    public static string ClientIp(HttpContext ctx)
    {
        // Caddy reverse-proxy X-Forwarded-For qoyur; ilk dəyər real müştəridir.
        var fwd = ctx.Request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrWhiteSpace(fwd)) return Truncate(fwd.Split(',')[0].Trim(), 60);
        return ctx.Connection.RemoteIpAddress?.ToString() ?? "";
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s : s[..n];
}
