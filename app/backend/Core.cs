using System.Text.Json;
using Npgsql;

namespace IdeaFlow;

/// <summary>Biznes qaydaları — status axını, rol icazələri, görünürlük.</summary>
public static class Rules
{
    public static readonly string[] Roles = ["author", "maker", "investor", "seller"];
    public static readonly string[] Categories = ["electronics", "home", "sport", "gadgets", "eco"];

    /// <summary>İdeyadan satışa qədər sıralı mərhələlər (rejected bura daxil deyil).</summary>
    public static readonly string[] Flow =
        ["draft", "assess", "demand", "findmaker", "findinv", "deal", "prod", "sales"];

    /// <summary>Kataloqda hər kəsə görünən statuslar. draft/assess/rejected gizlidir.</summary>
    public static readonly string[] PublicStatuses =
        ["demand", "findmaker", "findinv", "deal", "prod", "sales"];

    /// <summary>Kimin hansı keçidi edə bildiyi. Admin bütün keçidləri edə bilər.</summary>
    private static readonly Dictionary<string, (string To, string[] By)[]> Transitions = new()
    {
        ["draft"] = [("assess", ["author"])],
        ["assess"] = [("demand", ["admin"]), ("rejected", ["admin"])],
        ["demand"] = [("findmaker", ["author", "admin"]), ("rejected", ["admin"])],
        ["findmaker"] = [("findinv", ["author", "admin"]), ("rejected", ["admin"])],
        ["findinv"] = [("deal", ["author", "admin"]), ("rejected", ["admin"])],
        ["deal"] = [("prod", ["admin"]), ("rejected", ["admin"])],
        ["prod"] = [("sales", ["admin"])],
        ["sales"] = [],
        ["rejected"] = [("draft", ["admin"])],
    };

    public static bool CanTransition(string from, string to, string role, bool isOwner)
    {
        if (role == "admin") return Transitions.ContainsKey(from) && Transitions[from].Any(t => t.To == to);
        if (!Transitions.TryGetValue(from, out var allowed)) return false;
        var rule = allowed.FirstOrDefault(t => t.To == to);
        if (rule.To is null) return false;
        if (rule.By.Contains("author")) return role == "author" && isOwner;
        return false;
    }

    /// <summary>Verilmiş rol layihəni kataloqda görə bilərmi (sahibi və admin ayrıca yoxlanılır).</summary>
    public static string[] VisibleStatuses(string role) => role switch
    {
        "admin" => [.. Flow, "rejected"],
        "maker" => ["demand", "findmaker"],
        "investor" => ["findmaker", "findinv", "deal", "prod", "sales"],
        "seller" => ["demand", "findmaker", "findinv", "deal", "prod", "sales"],
        _ => PublicStatuses,
    };

    public static bool CanOffer(string role, string status) =>
        role == "maker" && (status == "demand" || status == "findmaker");

    public static bool CanInvest(string role, string status) =>
        role == "investor" && (status == "findmaker" || status == "findinv");

    public static bool CanPreorder(string role, string status) =>
        role == "seller" && PublicStatuses.Contains(status);
}

/// <summary>
/// Layihənin qiymətləndirilməsi. Bu, qara qutu deyil — açıq formuldur və nəticədə
/// hər komponentin payı göstərilir ki, müəllif reytinqin haradan gəldiyini görsün.
/// Sonradan real LLM çağırışı ilə əvəz edilə bilər (Assess.Run-un imzası dəyişmir).
/// </summary>
public static class Assess
{
    private static readonly Dictionary<string, int> CategoryWeight = new()
    {
        ["eco"] = 15, ["gadgets"] = 13, ["electronics"] = 12, ["home"] = 11, ["sport"] = 10,
    };

    private static readonly Dictionary<string, string> MarketSize = new()
    {
        ["eco"] = "$1.2B", ["gadgets"] = "$2.1B", ["electronics"] = "$4.6B",
        ["home"] = "$800M", ["sport"] = "$540M",
    };

    public sealed record Result(int Rating, string Market, string[] Risks, Dictionary<string, int> Breakdown);

    public static Result Run(string category, decimal? price, decimal? cost, int preorderQty, string descr)
    {
        var breakdown = new Dictionary<string, int>();
        var risks = new List<string>();

        // 1) Marja — 45 bal. Maya dəyəri və qiymət yoxdursa bal verilmir.
        int marginPts = 0;
        if (price is > 0 && cost is > 0 && price > cost)
        {
            var margin = (double)((price.Value - cost.Value) / price.Value);
            marginPts = (int)Math.Round(Math.Clamp(margin, 0, 1) * 45);
            if (margin < 0.35) risks.Add("risk_lowMargin");
        }
        else
        {
            risks.Add("risk_noCost");
        }
        breakdown["margin"] = marginPts;

        // 2) Təsdiqlənmiş tələb — 25 bal. Hər 10 ədəd ilkin sifariş 1 bal.
        var demandPts = Math.Min(preorderQty / 10, 25);
        breakdown["demand"] = demandPts;
        if (preorderQty == 0) risks.Add("risk_noDemand");

        // 3) Təsvirin tamlığı — 15 bal.
        var len = descr?.Trim().Length ?? 0;
        var descPts = (int)Math.Round(Math.Min(len / 300.0, 1.0) * 15);
        breakdown["descr"] = descPts;
        if (len < 120) risks.Add("risk_thinDescr");

        // 4) Kateqoriya trendi — 15 bal.
        var catPts = CategoryWeight.GetValueOrDefault(category, 8);
        breakdown["category"] = catPts;

        var rating = Math.Clamp(marginPts + demandPts + descPts + catPts, 0, 100);
        risks.Add("risk_certification"); // sertifikasiya hər fiziki məhsul üçün aktualdır

        return new Result(rating, MarketSize.GetValueOrDefault(category, "—"), [.. risks], breakdown);
    }
}

public static class Audit
{
    public static async Task LogAsync(NpgsqlConnection c, int? actorId, string action,
        string entity, int? entityId, object? meta, HttpContext? ctx)
    {
        await using var cmd = new NpgsqlCommand(
            "insert into audit (actor_id, action, entity, entity_id, meta, ip) values (@a,@ac,@e,@ei,@m,@ip)", c);
        cmd.Parameters.AddWithValue("a", (object?)actorId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("ac", action);
        cmd.Parameters.AddWithValue("e", entity);
        cmd.Parameters.AddWithValue("ei", (object?)entityId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("m", meta is null ? "" : JsonSerializer.Serialize(meta));
        cmd.Parameters.AddWithValue("ip", ctx is null ? "" : Auth.ClientIp(ctx));
        await cmd.ExecuteNonQueryAsync();
    }
}

/// <summary>Endpoint-lər üçün kiçik köməkçilər.</summary>
public static class Api
{
    public static IResult Err(int code, string key) => Results.Json(new { error = key }, statusCode: code);

    public static CurrentUser? User(HttpContext ctx) => ctx.Items["user"] as CurrentUser;

    /// <summary>Girişi olan və hesabı təsdiqlənmiş istifadəçini qaytarır.</summary>
    public static (CurrentUser? User, IResult? Fail) RequireActive(HttpContext ctx, params string[] roles)
    {
        var u = User(ctx);
        if (u is null) return (null, Err(401, "e_auth"));
        if (u.Status != "active") return (null, Err(403, "e_pending"));
        if (roles.Length > 0 && !roles.Contains(u.Role)) return (null, Err(403, "e_forbidden"));
        return (u, null);
    }

    public static string Str(JsonElement e, string name, int max = 4000)
    {
        if (!e.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String) return "";
        var s = v.GetString()!.Trim();
        return s.Length <= max ? s : s[..max];
    }

    public static int? Int(JsonElement e, string name)
    {
        if (!e.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i)) return i;
        if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var j)) return j;
        return null;
    }

    public static decimal? Dec(JsonElement e, string name)
    {
        if (!e.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d)) return d;
        if (v.ValueKind == JsonValueKind.String &&
            decimal.TryParse(v.GetString(), System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var e2)) return e2;
        return null;
    }
}
