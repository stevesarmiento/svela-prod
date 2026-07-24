export interface HermesParsedPrice {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number; // seconds
  };
}

export interface HermesPriceTick {
  feedId: string;
  priceUsd: number;
  confidenceUsd: number | null;
  publishTimeMs: number | null;
}

function normalizeFeedId(feedId: string): string {
  return feedId.startsWith("0x") ? feedId.slice(2) : feedId;
}

function toNumberOrNull(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeHermesParsedPrice(parsed: HermesParsedPrice): HermesPriceTick | null {
  const expo = parsed.price.expo;
  const rawPrice = toNumberOrNull(parsed.price.price);
  if (rawPrice === null) return null;

  const multiplier = 10 ** expo;
  const priceUsd = rawPrice * multiplier;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  const rawConf = toNumberOrNull(parsed.price.conf);
  const confidenceUsd =
    rawConf === null ? null : rawConf * multiplier;

  const publishTimeSec = parsed.price.publish_time;
  const publishTimeMs =
    Number.isFinite(publishTimeSec) && publishTimeSec > 0 ? publishTimeSec * 1000 : null;

  return {
    feedId: normalizeFeedId(parsed.id),
    priceUsd,
    confidenceUsd: confidenceUsd !== null && Number.isFinite(confidenceUsd) ? confidenceUsd : null,
    publishTimeMs,
  };
}

export interface HermesStreamOptions {
  endpointBaseUrl?: string; // default https://hermes.pyth.network
  feedIds: ReadonlyArray<string>;
  onTick: (tick: HermesPriceTick) => void;
  onError?: (error: unknown) => void;
}

/**
 * Stream Pyth prices via Hermes SSE.
 * Returns an unsubscribe function.
 */
export function subscribeHermesPriceStream(options: HermesStreamOptions): () => void {
  const baseUrl = options.endpointBaseUrl ?? "https://hermes.pyth.network";
  const feedIds = Array.from(
    new Set(
      options.feedIds.flatMap((id) => {
        const normalized = normalizeFeedId(id.trim());
        return normalized.length > 0 ? [normalized] : [];
      }),
    ),
  );

  if (feedIds.length === 0) return () => {};

  const idsParam = feedIds.map((id) => `ids[]=${id}`).join("&");
  const url = `${baseUrl}/v2/updates/price/stream?${idsParam}&parsed=true`;

  let aborted = false;
  const abortController = new AbortController();

  async function connect(): Promise<void> {
    try {
      const response = await fetch(url, { signal: abortController.signal });
      if (!response.ok || !response.body) {
        options.onError?.(new Error(`Hermes stream failed: ${response.status} ${response.statusText}`));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          try {
            const data = JSON.parse(payload) as unknown;
            const parsed = (data as { parsed?: HermesParsedPrice[] }).parsed?.[0];
            if (!parsed) continue;
            const tick = normalizeHermesParsedPrice(parsed);
            if (!tick) continue;
            options.onTick(tick);
          } catch {
            // Skip malformed SSE messages.
          }
        }
      }
    } catch (error: unknown) {
      if (aborted) return;
      if (error instanceof Error && error.name === "AbortError") return;
      options.onError?.(error);
    }

    if (!aborted) {
      setTimeout(() => void connect(), 3_000);
    }
  }

  void connect();

  return () => {
    aborted = true;
    abortController.abort();
  };
}

