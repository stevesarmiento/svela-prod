import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserApiKey } from "@/lib/user-api-keys";
import { generateText } from "ai";
import { z } from "zod";
import { gemini } from "@/lib/gemini";
import { ratelimit } from "@v1/kv/ratelimit";

export const dynamic = "force-dynamic";

/** Public shape returned to the app (no API key fields). */
export interface CoinGeckoNewsArticlePublic {
  title: string;
  url: string;
  image?: string;
  author?: string;
  posted_at?: string;
  type?: string;
  source_name?: string;
  ai?: {
    summary: string | null;
    sentiment: "bullish" | "bearish" | "neutral";
    confidence: number;
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const direct = safeJsonParse(trimmed);
  if (direct) return direct;

  // Handle fenced blocks like ```json { ... } ```
  const unfenced = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const fenceParsed = safeJsonParse(unfenced);
  if (fenceParsed) return fenceParsed;

  // Last resort: take the first {...} span.
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return safeJsonParse(unfenced.slice(first, last + 1));
}

function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return "127.0.0.1";
  const first = forwarded.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "127.0.0.1";
}

function parseArticle(raw: unknown): CoinGeckoNewsArticlePublic | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.title !== "string" || typeof o.url !== "string") return null;
  return {
    title: o.title,
    url: o.url,
    ...(typeof o.image === "string" ? { image: o.image } : {}),
    ...(typeof o.author === "string" ? { author: o.author } : {}),
    ...(typeof o.posted_at === "string" ? { posted_at: o.posted_at } : {}),
    ...(typeof o.type === "string" ? { type: o.type } : {}),
    ...(typeof o.source_name === "string" ? { source_name: o.source_name } : {}),
  };
}

const AiOutputSchema = z.object({
  summary: z.string().min(1).max(400).nullable(),
  sentiment: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number().min(0).max(1),
});

function parseLabeledLines(raw: string): z.infer<typeof AiOutputSchema> | null {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 8);

  const record: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!key || !value) continue;
    record[key] = value;
  }

  const sentimentRaw = record.sentiment?.toLowerCase();
  const sentiment =
    sentimentRaw === "bullish" || sentimentRaw === "bearish" || sentimentRaw === "neutral"
      ? sentimentRaw
      : null;

  const confidenceRaw = Number(record.confidence);
  const confidence =
    Number.isFinite(confidenceRaw) && confidenceRaw >= 0 && confidenceRaw <= 1 ? confidenceRaw : null;

  const summaryRaw = record.summary?.trim() ?? "";
  const summary = summaryRaw.length > 0 ? summaryRaw.slice(0, 400) : null;

  if (!sentiment) return null;
  return {
    summary,
    sentiment,
    confidence: confidence ?? (sentiment === "neutral" ? 0.35 : 0.6),
  };
}

function isSafeHttpUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "127.0.0.1" || host === "0.0.0.0") return false;
  if (host === "::1") return false;
  if (/^(10\.|192\.168\.|169\.254\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
  return true;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

function stripHtmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ");

  const raw = withoutNoise.replace(/<\/?[^>]+>/g, " ");
  return decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
}

function pickMetaDescription(html: string): string | null {
  const metaPatterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ];

  for (const re of metaPatterns) {
    const match = html.match(re);
    const content = match?.[1]?.trim();
    if (content && content.length >= 40) return decodeHtmlEntities(content);
  }
  return null;
}

function pickArticleText(html: string): string | null {
  const match = html.match(/<article[\s\S]*?<\/article>/i);
  if (!match?.[0]) return null;
  const text = stripHtmlToText(match[0]);
  return text.length >= 200 ? text : null;
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchArticleText(args: { url: string; abortSignal: AbortSignal }): Promise<string | null> {
  if (!isSafeHttpUrl(args.url)) return null;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 6000);
  const onAbort = () => ctrl.abort();
  args.abortSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(args.url, {
      redirect: "follow",
      headers: {
        // Some publishers block default user agents.
        "user-agent": "Mozilla/5.0 (compatible; SvelaBot/1.0; +https://svela.dev)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: ctrl.signal,
      next: { revalidate: 60 },
    });

    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("text/html")) return null;

    const len = Number(res.headers.get("content-length") ?? "0");
    // Skip very large pages.
    if (Number.isFinite(len) && len > 1_500_000) return null;

    const html = await res.text();
    if (!html) return null;

    const meta = pickMetaDescription(html);
    const article = pickArticleText(html);
    const fullText = stripHtmlToText(html);

    // Prefer <article>, otherwise prefer full body text over meta (meta often mirrors headline).
    const chosen = article ?? fullText ?? meta ?? "";

    // Cap input size to keep prompts sane.
    const clipped = chosen.slice(0, 6000);
    return clipped.length >= 200 ? clipped : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    args.abortSignal.removeEventListener("abort", onAbort);
  }
}

async function rewriteSummary(args: {
  title: string;
  draftSummary: string;
  articleText?: string | null;
  abortSignal: AbortSignal;
}): Promise<string | null> {
  if (!gemini) return null;

  const sys = `
Rewrite the draft summary into 1-2 sentences.

Rules:
- Do NOT copy the headline verbatim or near-verbatim.
- If you only have the title, paraphrase it more concretely (who did what, what changed) without adding facts.
- If article text is provided, base the summary on it and avoid fluff.
- Output plain text only (no JSON, no markdown).
  `.trim();

  const content = JSON.stringify(
    {
      title: args.title,
      draft_summary: args.draftSummary,
      article_text: args.articleText ?? null,
    },
    null,
    2,
  );

  const result = await generateText({
    model: gemini("gemini-2.5-flash"),
    messages: [
      { role: "system", content: sys },
      { role: "user", content },
    ],
    temperature: 0.2,
    maxOutputTokens: 140,
    abortSignal: args.abortSignal,
  });

  const text = result.text.trim();
  if (!text) return null;
  const clipped = text.slice(0, 400);
  if (normalizeForCompare(clipped) === normalizeForCompare(args.title)) return null;
  return clipped;
}

async function analyzeTitle(args: {
  title: string;
  sourceName?: string;
  postedAt?: string;
  articleText?: string | null;
  abortSignal: AbortSignal;
}): Promise<z.infer<typeof AiOutputSchema>> {
  if (!gemini) {
    return { summary: null, sentiment: "neutral", confidence: 0 };
  }

  const systemPrompt = `
You analyze crypto news and produce a concise summary + sentiment.

You will receive:
- title (headline)
- optional extracted article text (may be partial or noisy)

Be careful: do not invent facts beyond what is provided.

Output MUST be valid JSON only with this exact shape:
{
  "summary": string|null, // 1-2 sentences, plain English, no hype
  "sentiment": "bullish"|"bearish"|"neutral", // market tone implied by the title
  "confidence": number // 0 to 1
}

Rules:
- Use the extracted article text if present to reduce "neutral" overuse.
- If the content is unclear, purely informational, or you cannot find a market implication, set sentiment="neutral" and confidence <= 0.4.
- Summary should restate what the title/text claims, not add new claims.
- Do NOT copy the title verbatim as the summary.
  `.trim();

  const userPrompt = JSON.stringify(
    {
      title: args.title,
      source_name: args.sourceName ?? null,
      posted_at: args.postedAt ?? null,
      article_text: args.articleText ?? null,
    },
    null,
    2,
  );

  const result = await generateText({
    model: gemini("gemini-2.5-flash"),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
    maxOutputTokens: 220,
    abortSignal: args.abortSignal,
  });

  const raw = result.text.trim();
  const json = extractJsonObject(raw);
  const parsed = AiOutputSchema.safeParse(json);
  if (parsed.success) {
    const data = parsed.data;
    const normalized =
      data.summary && data.summary.trim().length > 0
        ? { ...data, summary: data.summary.trim().slice(0, 400) }
        : data;

    // If the model returns empty fields, fall through to the strict fallback below.
    if (normalized.summary !== null && normalized.confidence > 0) {
      if (normalizeForCompare(normalized.summary) !== normalizeForCompare(args.title)) return normalized;

      const rewritten = await rewriteSummary({
        title: args.title,
        draftSummary: normalized.summary,
        articleText: args.articleText,
        abortSignal: args.abortSignal,
      });
      return {
        ...normalized,
        summary: rewritten ?? normalized.summary,
      };
    }
  }

  // Fallback: ultra-strict labeled lines.
  const fallbackSystem = `
Return EXACTLY 3 lines, no extra text:
sentiment: bullish|bearish|neutral
confidence: 0-1
summary: 1-2 sentences (must be non-empty; if uncertain, paraphrase the title without adding facts)

Rules:
- Use extracted article text if present. If not, use only the title.
- If unclear, sentiment=neutral and confidence<=0.4.
- Do NOT copy the title verbatim as the summary.
  `.trim();

  const fallbackResult = await generateText({
    model: gemini("gemini-2.5-flash"),
    messages: [
      { role: "system", content: fallbackSystem },
      { role: "user", content: userPrompt },
    ],
    temperature: 0,
    maxOutputTokens: 180,
    abortSignal: args.abortSignal,
  });

  const fallbackRaw = fallbackResult.text.trim();
  const labeled = parseLabeledLines(fallbackRaw);
  if (labeled) {
    const summary = labeled.summary?.trim();
    const confidence =
      labeled.confidence > 0 ? labeled.confidence : labeled.sentiment === "neutral" ? 0.35 : 0.6;
    const base = {
      ...labeled,
      summary: summary && summary.length > 0 ? summary.slice(0, 400) : args.title.slice(0, 400),
      confidence,
    };

    if (normalizeForCompare(base.summary ?? "") === normalizeForCompare(args.title)) {
      const rewritten = await rewriteSummary({
        title: args.title,
        draftSummary: base.summary ?? args.title,
        articleText: args.articleText,
        abortSignal: args.abortSignal,
      });
      return { ...base, summary: rewritten ?? base.summary };
    }

    return base;
  }

  return { summary: null, sentiment: "neutral", confidence: 0 };
}

export async function GET(request: NextRequest) {
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }

  const apiKeyResult = await getUserApiKey(userId, "coingecko", "X_CG_PRO_API_KEY");
  const apiKey = apiKeyResult.key;

  if (!apiKey) {
    return NextResponse.json({ error: "CoinGecko API key not configured" }, { status: 503 });
  }

  const sp = request.nextUrl.searchParams;
  const coinIdRaw = sp.get("coin_id");
  const coinId = coinIdRaw && coinIdRaw.trim().length > 0 ? coinIdRaw.trim() : undefined;

  const includeAi = sp.get("include_ai") === "1";

  if (includeAi && !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (includeAi && !gemini) {
    return NextResponse.json({ error: "Gemini client not configured (GEMINI_API_KEY)" }, { status: 503 });
  }

  if (includeAi && userId) {
    const ip = getRequestIp(request);
    try {
      const rateLimitResult = await ratelimit.limit(`${ip}-${userId}-coingecko-news-ai`);
      if (!rateLimitResult.success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    } catch (error) {
      console.warn("coingecko-news ai ratelimit error (skipping):", error);
    }
  }

  const perPage = clampInt(Number(sp.get("per_page") ?? "5"), 1, 50);
  const page = clampInt(Number(sp.get("page") ?? "1"), 1, 20);
  const language = (sp.get("language")?.trim() || "en") || "en";

  // CoinGecko caps per_page at 20, so larger pulls fan out across consecutive pages.
  const CG_MAX_PER_PAGE = 20;
  const pageCount = Math.max(1, Math.ceil(perPage / CG_MAX_PER_PAGE));
  const responses = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => {
      const url = new URL("https://pro-api.coingecko.com/api/v3/news");
      url.searchParams.set("page", String(page + index));
      url.searchParams.set("per_page", String(Math.min(perPage, CG_MAX_PER_PAGE)));
      url.searchParams.set("language", language);
      // Enforce news-only (never guides).
      url.searchParams.set("type", "news");
      if (coinId) url.searchParams.set("coin_id", coinId);

      return fetch(url.toString(), {
        headers: {
          "x-cg-pro-api-key": apiKey,
          Accept: "application/json",
        },
        next: { revalidate: 60 },
      });
    }),
  );

  const failedResponse = responses.find((response) => !response.ok);
  if (failedResponse) {
    const body = await failedResponse.text().catch(() => "");
    return NextResponse.json(
      {
        error: "CoinGecko news request failed",
        details: body.slice(0, 300),
      },
      { status: 502 },
    );
  }

  const data: unknown[] = [];
  for (const response of responses) {
    let pageData: unknown;
    try {
      pageData = await response.json();
    } catch {
      return NextResponse.json(
        { error: "Failed to parse CoinGecko news response", articles: [] as CoinGeckoNewsArticlePublic[] },
        { status: 502 },
      );
    }

    if (!Array.isArray(pageData)) {
      return NextResponse.json(
        { error: "Unexpected CoinGecko news response", articles: [] as CoinGeckoNewsArticlePublic[] },
        { status: 502 },
      );
    }

    data.push(...pageData);
  }

  const articles: CoinGeckoNewsArticlePublic[] = [];
  const seenUrls = new Set<string>();
  for (const item of data) {
    if (articles.length >= perPage) break;
    const parsed = parseArticle(item);
    if (!parsed) continue;
    // Defense in depth: only keep explicit `type=news`.
    if (parsed.type !== "news") continue;
    // Consecutive pages can shift while the feed updates; drop duplicates.
    if (seenUrls.has(parsed.url)) continue;
    seenUrls.add(parsed.url);
    articles.push(parsed);
  }

  if (includeAi) {
    const aiLimit = Math.min(5, articles.length);
    const analyzed = await Promise.all(
      articles.slice(0, aiLimit).map(async (article) => {
        const articleText = await fetchArticleText({ url: article.url, abortSignal: request.signal });
        const ai = await analyzeTitle({
          title: article.title,
          sourceName: article.source_name,
          postedAt: article.posted_at,
          articleText,
          abortSignal: request.signal,
        });
        return { ...article, ai };
      }),
    );

    for (let i = 0; i < aiLimit; i++) articles[i] = analyzed[i]!;
  }

  return NextResponse.json(
    { articles },
    {
      status: 200,
      headers: {
        "Cache-Control": includeAi
          ? "public, s-maxage=300, stale-while-revalidate=600"
          : "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
