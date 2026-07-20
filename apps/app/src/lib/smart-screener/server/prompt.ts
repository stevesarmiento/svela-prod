import { SMART_SCREENER_METRICS } from "../metric-registry";

/**
 * Bump whenever the system prompt, metric catalog format, or output shape
 * changes in a way that could alter interpretations — the version is part of
 * the interpretation-cache key, so a bump invalidates stale cached DSLs.
 * (The cache key also hashes the metric-id list, so ADDING a metric without
 * bumping this still invalidates.)
 */
// v4: volatility-compression idioms + top-N-by-mcap-as-rank-filter rule.
// (v3: thinking disabled + higher token ceiling.) Bump on any behavior change
// so cached interpretations from older prompts are never served.
export const SMART_SCREENER_PROMPT_VERSION = 4;

export function buildMetricCatalogForPrompt(): string {
  return SMART_SCREENER_METRICS.map((m) => {
    const synonyms =
      m.synonyms.length > 0 ? ` (synonyms: ${m.synonyms.join(", ")})` : "";
    const unitHint =
      m.unit === "usd"
        ? "USD number (allow compact like 10m)"
        : m.unit === "percent"
          ? "percent points (10 means 10%)"
          : m.unit === "ratio"
            ? "ratio 0..1 (55% => 0.55)"
            : m.unit === "rank"
              ? "integer rank (1 is highest)"
              : "number";
    const sourceHint = m.source === "taker" ? "taker/derivatives" : "markets";
    const description = m.description ? ` — ${m.description}` : "";
    return `- ${m.id}: ${m.label} [${unitHint}; source=${sourceHint}]${synonyms}${description}`;
  }).join("\n");
}

/**
 * The ONE system prompt for smart-screener interpretation. Both the public
 * screen route and the internal debug route build from here — never copy it.
 */
export function buildSmartScreenerSystemPrompt(): string {
  const metricCatalog = buildMetricCatalogForPrompt();
  return `
You are an intent parser for a crypto smart screener.

Return valid JSON ONLY with shape:
{
  "dsl": {
    "filters": [{ "metricId": string, "op": "gt"|"gte"|"lt"|"lte"|"eq", "value": number }],
    "sort": { "metricId": string, "order": "asc"|"desc" } | null,
    "limit": number,
    "universe": "all"|"current"|"watchlist",
    "takerContext": { "range": "1h"|"4h"|"12h"|"24h"|"7d", "exchange": string | null } | null
  },
  "confidence": number
}

Available metrics (ONLY use these metricId values):
${metricCatalog}

Rules:
- Output MUST be valid JSON only. No markdown, no prose.
- Prefer using numeric values, not strings.
- For money, use a number. Examples: 200m => 200000000, $5m => 5000000.
- For percent metrics: use percent points (10 means 10%). 0.5 means 0.5%, NEVER 50%.
- For ratio metrics: use 0..1 (55% => 0.55).
- "limit" MUST be a number (1..500). If you don't know, omit it.
- If user asks for "top" or "highest", encode as sort desc. If "lowest", sort asc.
- If user asks for "all coins" or "the market", set universe="all".
- Set "takerContext" ONLY when using taker/derivatives metrics; default range is "24h",
  exchange is null unless the user names one (e.g. "on Binance" => "Binance").
- Taker vocabulary: "buy ratio above 55%" => taker_buy_ratio gt 0.55;
  "buy > sell" or "more buying than selling" => taker_buy_ratio gt 0.5;
  "net buy over $10m" => taker_net_buy_usd gt 10000000.
- "only green" / "gainers" => price_change_24h_pct gt 0; "red" / "losers" => lt 0.
- "moved/changed less than $X" means a BAND (absolute move): emit TWO filters,
  price_change_24h_usd gt -X AND price_change_24h_usd lt X. Same idea for
  "moved less than X%" with price_change_24h_pct.
- Volatility-compression slang means LOW current volatility: "coiled",
  "coiled spring", "(volatility) squeeze", "compressed", "tight range",
  "consolidating", "ready to rip/pop/break out". With no number given, do NOT
  invent a threshold — sort volatility_7d_pct asc instead (most coiled first),
  and ALSO add volatility_7d_pct gt 0.1 (pegged stablecoins/treasuries sit
  below 0.1 and are never what a squeeze query means).
- Plain "top N coins by market cap" (nothing else asked): sort=market_cap_usd
  desc with limit N. But "top N coins by market cap that ALSO <other concept>":
  encode the market-cap part as market_cap_rank lte N (a universe restriction)
  so the sort stays free for the <other concept>.
- If you are not confident, set confidence <= 0.4 and return an empty filters list.
  `.trim();
}
