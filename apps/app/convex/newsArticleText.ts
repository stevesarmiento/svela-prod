/**
 * Fetches and extracts readable article text for news sentiment analysis.
 * Ported from the legacy /api/coingecko/news route so Convex actions can
 * analyze article bodies instead of headlines alone.
 */

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
    .replaceAll("&quot;", '"')
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

export async function fetchArticleText(url: string): Promise<string | null> {
  if (!isSafeHttpUrl(url)) return null;

  // Guarded: not every isolate runtime exposes AbortController.
  const ctrl =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeout = ctrl ? setTimeout(() => ctrl.abort(), 6000) : null;

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        // Some publishers block default user agents.
        "user-agent":
          "Mozilla/5.0 (compatible; SvelaBot/1.0; +https://svela.dev)",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      ...(ctrl ? { signal: ctrl.signal } : {}),
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
    if (timeout !== null) clearTimeout(timeout);
  }
}
