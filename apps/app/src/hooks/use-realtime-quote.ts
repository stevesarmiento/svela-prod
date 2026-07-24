"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getPythFeedMapping } from "@/lib/realtime-prices/pyth-feed-mapping";
import { resolveHermesCryptoUsdFeedId } from "@/lib/realtime-prices/pyth-feed-resolver";
import { subscribeHermesPriceStream, type HermesPriceTick } from "@/lib/realtime-prices/pyth-hermes-stream";
import { setLiveSpotPrice } from "@/lib/realtime-prices/live-spot-store";

const UI_THROTTLE_MS = 1_000;
const PERSIST_INTERVAL_MS = 20_000;
const REALTIME_STALE_MS = 7_500;

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "server";
  const key = "SVELA_REALTIME_PRICE_SESSION_ID";
  const existing = window.localStorage.getItem(key);
  if (existing && existing.length > 8) return existing;
  const next = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
  window.localStorage.setItem(key, next);
  return next;
}

export interface UseRealtimeQuoteArgs {
  coingeckoId: string;
  /** Optional CoinGecko symbol (recommended for dynamic Hermes feed resolution). */
  symbol?: string;
  enabled?: boolean;
  /** If false, do not start the realtime stream/persistence yet (warm start can still run). */
  streamEnabled?: boolean;
}

export type RealtimeQuoteStatusKind = "realtime" | "last-known" | "fallback" | "disabled";

export interface RealtimeQuoteStatus {
  kind: RealtimeQuoteStatusKind;
  updatedAtMs: number | null;
  source: "pyth" | "coingecko" | "none";
}

const DISABLED_STATUS: RealtimeQuoteStatus = { kind: "disabled", updatedAtMs: null, source: "none" };

export function useRealtimeQuote(args: UseRealtimeQuoteArgs): RealtimeQuoteStatus {
  const enabled = (args.enabled ?? true) && args.coingeckoId.length > 0;
  const streamEnabled = enabled && (args.streamEnabled ?? true);
  const mapping = useMemo(() => getPythFeedMapping(args.coingeckoId), [args.coingeckoId]);
  const symbolUpper = (args.symbol ?? "").trim().toUpperCase();
  const [resolvedFeedId, setResolvedFeedId] = useState<string | null>(null);
  const [status, setStatus] = useState<RealtimeQuoteStatus>(() => ({
    kind: "fallback",
    updatedAtMs: null,
    source: "coingecko",
  }));

  const feedId = mapping?.hermesFeedId ?? resolvedFeedId;
  const source = mapping?.source ?? "pyth";

  const lastKnown = useConvexQuery(
    api.lastKnownPrices.getLastKnownPrice,
    enabled ? { coingeckoId: args.coingeckoId, source } : "skip",
  );

  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const upsertLastKnown = useMutation(api.lastKnownPrices.upsertLastKnownPrice);

  const sessionIdRef = useRef<string | null>(null);
  const latestTickRef = useRef<HermesPriceTick | null>(null);
  const lastRealtimeTickAtRef = useRef<number | null>(null);
  const lastUiUpdateAtRef = useRef(0);
  const lastPersistAtRef = useRef(0);

  // Resolve the session id after mount: getOrCreateSessionId touches
  // localStorage, so it must not run during render.
  useEffect(() => {
    if (sessionIdRef.current === null) {
      sessionIdRef.current = getOrCreateSessionId();
    }
  }, []);

  // Dynamic feed resolution for unmapped coins (token page only).
  useEffect(() => {
    if (!enabled) return;
    if (mapping) return;
    if (!symbolUpper) return;
    if (resolvedFeedId) return;

    let cancelled = false;
    void (async () => {
      const next = await resolveHermesCryptoUsdFeedId(symbolUpper);
      if (cancelled) return;
      if (!next) return;
      setResolvedFeedId(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, mapping, symbolUpper, resolvedFeedId]);

  // Warm start: seed the live spot store from Convex last-known.
  useEffect(() => {
    if (!enabled) return;
    if (!lastKnown) return;
    if (!Number.isFinite(lastKnown.priceUsd) || lastKnown.priceUsd <= 0) return;

    setLiveSpotPrice(args.coingeckoId, {
      priceUsd: lastKnown.priceUsd,
      updatedAtMs: lastKnown.updatedAt,
      source: "last-known",
    });

    setStatus((prev) => {
      if (prev.kind === "realtime") return prev;
      if (prev.kind === "last-known" && prev.updatedAtMs === lastKnown.updatedAt) return prev;
      return { kind: "last-known", updatedAtMs: lastKnown.updatedAt, source: "pyth" };
    });
  }, [enabled, lastKnown, args.coingeckoId]);

  // Stream realtime ticks into the live spot store (throttled).
  useEffect(() => {
    if (!streamEnabled) return;
    if (!feedId) return;

    const unsubscribe = subscribeHermesPriceStream({
      feedIds: [feedId],
      onError: () => {
        setStatus((prev) => (prev.kind === "fallback" ? prev : { kind: "fallback", updatedAtMs: prev.updatedAtMs, source: "coingecko" }));
      },
      onTick: (tick) => {
        latestTickRef.current = tick;
        lastRealtimeTickAtRef.current = Date.now();

        const now = Date.now();
        if (now - lastUiUpdateAtRef.current < UI_THROTTLE_MS) return;
        lastUiUpdateAtRef.current = now;

        const updatedAtMs = tick.publishTimeMs ?? now;
        setLiveSpotPrice(args.coingeckoId, {
          priceUsd: tick.priceUsd,
          updatedAtMs,
          source: "pyth",
        });

        // Avoid rerendering the entire page on every tick; UI reads live price from the store.
        setStatus((prev) => (prev.kind === "realtime" ? prev : { kind: "realtime", updatedAtMs, source: "pyth" }));
      },
    });

    return () => unsubscribe();
  }, [streamEnabled, feedId, args.coingeckoId]);

  // Degrade realtime status if ticks go stale.
  useEffect(() => {
    if (!streamEnabled) return;
    if (!feedId) return;

    const intervalId = window.setInterval(() => {
      const lastAt = lastRealtimeTickAtRef.current;
      if (lastAt == null) return;
      if (Date.now() - lastAt <= REALTIME_STALE_MS) return;

      setStatus((prev) => {
        if (prev.kind !== "realtime") return prev;
        return { kind: "fallback", updatedAtMs: prev.updatedAtMs, source: "coingecko" };
      });
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, [streamEnabled, feedId]);

  // Periodically persist last-known snapshot back to Convex (hybrid model).
  useEffect(() => {
    if (!streamEnabled) return;
    if (!feedId) return;
    if (isAuthLoading) return;
    if (!isAuthenticated) return;

    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    const intervalId = window.setInterval(() => {
      const tick = latestTickRef.current;
      if (!tick) return;

      const now = Date.now();
      if (now - lastPersistAtRef.current < PERSIST_INTERVAL_MS) return;
      lastPersistAtRef.current = now;

      void upsertLastKnown({
        coingeckoId: args.coingeckoId,
        source,
        sessionId,
        priceUsd: tick.priceUsd,
        publishTime: tick.publishTimeMs ?? undefined,
        confidence: tick.confidenceUsd ?? undefined,
      });
    }, 2_000);

    return () => window.clearInterval(intervalId);
  }, [
    streamEnabled,
    feedId,
    isAuthenticated,
    isAuthLoading,
    upsertLastKnown,
    args.coingeckoId,
    source,
  ]);

  // Derived during render (no adjustment effect): while disabled report the
  // disabled status; the internal state machine keeps the last stream status,
  // which the warm-start/stream effects refresh on re-enable.
  return enabled ? status : DISABLED_STATUS;
}

