"use client";

import { createParser, parseAsString, useQueryStates } from "nuqs";

import {
  type ScreeningDsl,
  ScreeningDslSchema,
} from "@/lib/smart-screener/screening-dsl";

/**
 * URL IS THE STORE.
 *
 * - `dsl`  — the screening DSL (filters/sort/limit/universe/takerContext),
 *            compact-encoded; null = browse mode. Zod-validated on parse and
 *            FAIL-CLOSED to browse mode on garbage.
 * - `sort` — explicit header-click sort in COLUMN-KEY domain ("marketCap.desc").
 *            null = defer to dsl.sort (screen mode) or the default.
 * - `q`    — plain text search (browse mode only).
 *
 * Everything is shareable/bookmarkable; reload restores the exact screen.
 */

export type ScreenerSortKey =
  | "name"
  | "price"
  | "marketCap"
  | "volume"
  | "change";

export interface ScreenerSort {
  key: ScreenerSortKey;
  desc: boolean;
}

/** Column-key → DSL metric id ("name" is client-only, no metric). */
export const SORT_KEY_TO_METRIC_ID: Record<ScreenerSortKey, string | null> = {
  name: null,
  price: "price_usd",
  marketCap: "market_cap_usd",
  volume: "volume_24h_usd",
  change: "price_change_24h_pct",
};

export const METRIC_ID_TO_SORT_KEY: Record<string, ScreenerSortKey> = {
  price_usd: "price",
  market_cap_usd: "marketCap",
  volume_24h_usd: "volume",
  price_change_24h_pct: "change",
};

const SORT_KEYS: ReadonlyArray<ScreenerSortKey> = [
  "name",
  "price",
  "marketCap",
  "volume",
  "change",
];

// ---- DSL codec (compact tuples; omit defaults) ----

interface CompactDsl {
  f?: Array<[string, string, number]>;
  s?: [string, string] | null;
  l?: number;
  u?: string;
  t?: [string, string | null];
}

function encodeDsl(dsl: ScreeningDsl): string {
  const compact: CompactDsl = {};
  if (dsl.filters.length > 0) {
    compact.f = dsl.filters.map((f) => [f.metricId, f.op, f.value]);
  }
  if (dsl.sort) compact.s = [dsl.sort.metricId, dsl.sort.order];
  if (dsl.limit !== 250) compact.l = dsl.limit;
  if (dsl.universe !== "all") compact.u = dsl.universe;
  if (dsl.takerContext)
    compact.t = [dsl.takerContext.range, dsl.takerContext.exchange];
  return JSON.stringify(compact);
}

function decodeDsl(raw: string): ScreeningDsl | null {
  try {
    const compact = JSON.parse(raw) as CompactDsl;
    if (typeof compact !== "object" || compact === null) return null;

    const candidate = {
      filters: Array.isArray(compact.f)
        ? compact.f.map((tuple) => ({
            metricId: tuple?.[0],
            op: tuple?.[1],
            value: tuple?.[2],
          }))
        : [],
      sort:
        Array.isArray(compact.s) && compact.s.length === 2
          ? { metricId: compact.s[0], order: compact.s[1] }
          : null,
      limit: typeof compact.l === "number" ? compact.l : null,
      universe: typeof compact.u === "string" ? compact.u : "all",
      takerContext: Array.isArray(compact.t)
        ? { range: compact.t[0], exchange: compact.t[1] ?? null }
        : null,
    };

    const parsed = ScreeningDslSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const dslParser = createParser<ScreeningDsl>({
  parse: (value) => decodeDsl(value),
  serialize: (value) => encodeDsl(value),
  eq: (a, b) => encodeDsl(a) === encodeDsl(b),
});

const sortParser = createParser<ScreenerSort>({
  parse: (value) => {
    const [key, dir] = value.split(".");
    if (!SORT_KEYS.includes(key as ScreenerSortKey)) return null;
    if (dir !== "asc" && dir !== "desc") return null;
    return { key: key as ScreenerSortKey, desc: dir === "desc" };
  },
  serialize: (value) => `${value.key}.${value.desc ? "desc" : "asc"}`,
  eq: (a, b) => a.key === b.key && a.desc === b.desc,
});

export interface ScreenerUrlState {
  dsl: ScreeningDsl | null;
  sort: ScreenerSort | null;
  q: string;
  setDsl: (dsl: ScreeningDsl | null) => void;
  setSort: (sort: ScreenerSort | null) => void;
  setQ: (q: string) => void;
  /** Apply an NL result atomically: new DSL, sort/search intent reset. */
  applyScreen: (dsl: ScreeningDsl) => void;
  clearAll: () => void;
}

export function useScreenerUrlState(): ScreenerUrlState {
  const [state, setState] = useQueryStates(
    {
      dsl: dslParser,
      sort: sortParser,
      q: parseAsString.withDefault(""),
    },
    { history: "replace" },
  );

  return {
    dsl: state.dsl,
    sort: state.sort,
    q: state.q,
    setDsl: (dsl) => void setState({ dsl }),
    setSort: (sort) => void setState({ sort }),
    setQ: (q) => void setState({ q: q || null }),
    applyScreen: (dsl) => void setState({ dsl, sort: null, q: null }),
    clearAll: () => void setState({ dsl: null, sort: null, q: null }),
  };
}
