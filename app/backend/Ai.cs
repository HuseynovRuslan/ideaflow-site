using System.Text.Json;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Beta;
using Anthropic.Models.Beta.Messages;

namespace IdeaFlow;

/// <summary>
/// Claude ilə dərin qiymətləndirmə. Formul (Assess.Run) sürətli və pulsuz bal verir;
/// bu isə onun yanında bazar, rəqiblər, risklər və konkret məsləhətlərlə mətn hesabatı
/// yazır. Claude veb-axtarışla real rəqib və qiymətləri tapır, cavab isə sabit JSON
/// sxemi ilə qayıdır ki, interfeys onu etibarlı şəkildə göstərə bilsin.
///
/// ANTHROPIC_API_KEY verilməyibsə funksiya sönülüdür — platformanın qalanı işləyir.
/// </summary>
public static class Ai
{
    private const string Model = "claude-opus-5-5";

    /// <summary>Hazırda təhlil gedən layihələr (id → 0).</summary>
    public static readonly System.Collections.Concurrent.ConcurrentDictionary<int, byte> Running = new();

    public static bool Enabled =>
        !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY"));

    public sealed record Input(
        string Title, string Descr, string Category, decimal? Price, decimal? Cost,
        int? Moq, int Royalty, int Preorders, int Interests, int FormulaRating);

    /// <summary>Uğurlu halda JSON hesabatı, uğursuz halda xəta açarı (i18n) qaytarır.</summary>
    public static async Task<(string? Json, string? Error)> RunAsync(Input p, string lang, CancellationToken ct)
    {
        if (!Enabled) return (null, "e_aiOff");

        var client = new AnthropicClient
        {
            ApiKey = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY"),
            MaxRetries = 1,
        };

        BetaMessage resp;
        try
        {
            resp = await client.Beta.Messages.Create(new MessageCreateParams
            {
                Model = Model,
                MaxTokens = 16000,
                // Siyasət səbəbilə imtina olarsa server özü uyğun modelə keçir.
                Betas = [AnthropicBeta.ServerSideFallback2026_07_01],
                Fallbacks = new Default(),
                Thinking = new BetaThinkingConfigAdaptive(),
                OutputConfig = new BetaOutputConfig
                {
                    Effort = Effort.High,
                    Format = new BetaJsonOutputFormat { Schema = Schema },
                },
                Tools = [new BetaWebSearchTool20260209 { MaxUses = 4 }],
                System = SystemPrompt,
                Messages = [new() { Role = Role.User, Content = UserPrompt(p, lang) }],
            }, cancellationToken: ct);
        }
        catch (AnthropicRateLimitException) { return (null, "e_aiBusy"); }
        catch (Anthropic5xxException) { return (null, "e_aiBusy"); }
        catch (AnthropicApiException) { return (null, "e_aiFail"); }
        catch (AnthropicIOException) { return (null, "e_aiBusy"); }
        catch (OperationCanceledException) { return (null, "e_aiBusy"); }

        if (resp.StopReason == BetaStopReason.Refusal) return (null, "e_aiRefused");
        if (resp.StopReason == BetaStopReason.MaxTokens) return (null, "e_aiFail");

        // Veb-axtarış olan cavabda mətn bir neçə bloka bölünə bilər; JSON sonuncu
        // mətn hissəsindədir. Blokları birləşdirib ilk «{»-dən son «}»-ə qədər götürürük.
        var text = string.Concat(resp.Content.Select(b => b.Value).OfType<BetaTextBlock>().Select(t => t.Text));
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) return (null, "e_aiFail");
        var json = text[start..(end + 1)];

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return (null, "e_aiFail");
        }
        catch (JsonException) { return (null, "e_aiFail"); }

        return (json, null);
    }

    // ------------------------------------------------------------------ prompt
    private const string SystemPrompt = """
        You are a product-launch analyst for IdeaFlow, a platform in Azerbaijan that takes
        physical-product ideas from inventors to contract manufacturing, investment and retail.
        The people reading your report are the inventor, manufacturers deciding whether to quote,
        and investors deciding whether to fund. Be concrete, honest and useful to all three.

        Ground the analysis in the real market: use web search to find comparable products that
        are actually sold (Azerbaijan, Turkey, Russia/CIS, and global marketplaces), their retail
        prices, and any certification or import rules that apply to this category in Azerbaijan.
        Prefer a few well-chosen searches over many. Cite the pages you relied on in `sources`.

        Judge the idea as a business, not as a pitch: say plainly when margins are too thin, the
        market is crowded, or the description is too vague to evaluate. Do not invent numbers you
        could not find — give a range and say it is an estimate. Prices are in US dollars.

        Write every human-readable field in the language requested by the user message.
        Keep each text field to a few sentences; lists should have 3–6 items.
        """;

    private static string UserPrompt(Input p, string lang)
    {
        var language = lang switch { "ru" => "Russian", "en" => "English", _ => "Azerbaijani" };
        string M(decimal? v) => v is null ? "not given" : "$" + v.Value.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);
        return $"""
            Assess this product idea. Write the report in {language}.

            <idea>
            Title: {p.Title}
            Category: {p.Category}
            Description:
            {(string.IsNullOrWhiteSpace(p.Descr) ? "(no description given)" : p.Descr)}

            Planned retail price: {M(p.Price)}
            Estimated unit cost: {M(p.Cost)}
            Minimum order quantity: {(p.Moq is null ? "not given" : p.Moq.ToString())}
            Author royalty: {p.Royalty}%
            Validated demand so far: {p.Preorders} units pre-ordered by retailers, {p.Interests} consumers said "I would buy"
            Platform formula score (margin/demand/description/category): {p.FormulaRating}/100
            </idea>

            `score` is your own 0–100 judgement of launch readiness, independent of the formula.
            `verdict` is "go" (ready to look for a manufacturer), "refine" (promising but fix the
            listed gaps first) or "stop" (fundamental problem).
            """;
    }

    // ------------------------------------------------------------------- sxem
    private static readonly Dictionary<string, JsonElement> Schema =
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>("""
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["summary","verdict","score","market","audience","competitors","pricing","risks","improvements","nextSteps","sources"],
          "properties": {
            "summary":  { "type": "string" },
            "verdict":  { "type": "string", "enum": ["go","refine","stop"] },
            "score":    { "type": "integer" },
            "market": {
              "type": "object", "additionalProperties": false,
              "required": ["size","trend","notes"],
              "properties": {
                "size":  { "type": "string" },
                "trend": { "type": "string" },
                "notes": { "type": "string" }
              }
            },
            "audience": { "type": "string" },
            "competitors": {
              "type": "array",
              "items": {
                "type": "object", "additionalProperties": false,
                "required": ["name","price","note"],
                "properties": {
                  "name":  { "type": "string" },
                  "price": { "type": "string" },
                  "note":  { "type": "string" }
                }
              }
            },
            "pricing": { "type": "string" },
            "risks": {
              "type": "array",
              "items": {
                "type": "object", "additionalProperties": false,
                "required": ["title","detail","severity"],
                "properties": {
                  "title":    { "type": "string" },
                  "detail":   { "type": "string" },
                  "severity": { "type": "string", "enum": ["low","medium","high"] }
                }
              }
            },
            "improvements": { "type": "array", "items": { "type": "string" } },
            "nextSteps":    { "type": "array", "items": { "type": "string" } },
            "sources": {
              "type": "array",
              "items": {
                "type": "object", "additionalProperties": false,
                "required": ["title","url"],
                "properties": {
                  "title": { "type": "string" },
                  "url":   { "type": "string" }
                }
              }
            }
          }
        }
        """)!;
}
