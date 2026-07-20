import { z } from "zod";

import type { MetricUnit } from "./metric-catalog";
import {
  SMART_SCREENER_METRIC_IDS,
  getSmartScreenerMetric,
} from "./metric-registry";
import {
  IntegerSchema,
  PercentPointsSchema,
  UsdAmountSchema,
} from "./number-coercions";
import { TAKER_RANGES } from "./taker-metrics";

function coerceNumber(value: unknown): number | unknown {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  // Prefer USD parsing for compact amounts like 200m / $200m / 1.2b.
  if (/^[\d$]/.test(trimmed)) {
    const usd = UsdAmountSchema.safeParse(trimmed);
    if (usd.success) return usd.data;
  }

  // Percent points parsing when it looks like a percent.
  if (/%\s*$/.test(trimmed)) {
    const pct = PercentPointsSchema.safeParse(trimmed);
    if (pct.success) return pct.data;
  }

  const parsed = Number.parseFloat(trimmed.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : value;
}

const MetricIdSchema = z
  .string()
  .min(1)
  .refine((id) => SMART_SCREENER_METRIC_IDS.includes(id), "Unknown metricId");

export const ScreenFilterOpSchema = z.enum(["gt", "gte", "lt", "lte", "eq"]);
export type ScreenFilterOp = z.infer<typeof ScreenFilterOpSchema>;

/**
 * Canonical value normalization — the ONLY place filter values are transformed.
 * Runs once at parse time so downstream comparisons use `filter.value` as-is.
 *
 * - ratio: values > 1 are treated as percent input and divided by 100 (55 -> 0.55).
 * - percent: NO magnitude heuristic. "55%" is coerced by `coerceNumber`; a bare
 *   0.5 means 0.5 percentage points (never silently multiplied to 50).
 * - usd / rank / number: unchanged.
 */
function normalizeFilterValueByUnit(unit: MetricUnit, value: number): number {
  if (!Number.isFinite(value)) return value;
  if (unit === "ratio" && value > 1) return value / 100;
  return value;
}

export const ScreenFilterSchema = z
  .object({
    metricId: MetricIdSchema,
    op: ScreenFilterOpSchema,
    value: z.preprocess(coerceNumber, z.number()),
  })
  .transform((filter) => {
    const metric = getSmartScreenerMetric(filter.metricId);
    if (!metric) return filter;
    return {
      ...filter,
      value: normalizeFilterValueByUnit(metric.unit, filter.value),
    };
  })
  .superRefine((filter, ctx) => {
    const metric = getSmartScreenerMetric(filter.metricId);
    if (!metric) return;

    const unit: MetricUnit = metric.unit;
    const v = filter.value;
    if (!Number.isFinite(v)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Value must be a finite number",
      });
      return;
    }

    if (unit === "usd") {
      if (v < 0 && !metric.allowNegative) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "USD value must be >= 0",
        });
      }
      return;
    }

    if (unit === "ratio") {
      if (v < 0 || v > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Ratio must be 0..1 (or a % like 55%)",
        });
      }
      return;
    }

    if (unit === "rank") {
      const parsed = IntegerSchema.safeParse(v);
      if (!parsed.success || parsed.data < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Rank must be an integer >= 1",
        });
      }
    }
  });

export const ScreenSortSchema = z.object({
  metricId: MetricIdSchema,
  order: z.enum(["asc", "desc"]),
});

export const SmartScreenerUniverseSchema = z.enum([
  "all",
  "current",
  "watchlist",
]);

/**
 * Scoping for taker (derivatives) metrics: which CoinGlass range the snapshot
 * covers and an optional single-exchange scope (null = aggregated overall).
 * Only meaningful when the DSL uses taker-source metrics.
 */
export const TakerContextSchema = z.object({
  range: z.enum(TAKER_RANGES).optional().default("24h"),
  exchange: z.string().min(1).nullable().optional().default(null),
});

export type TakerContext = z.infer<typeof TakerContextSchema>;

export const ScreeningDslSchema = z.object({
  filters: z.array(ScreenFilterSchema).max(20).default([]),
  sort: z.union([ScreenSortSchema, z.null()]).optional().default(null),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .nullable()
    .optional()
    .transform((v) => v ?? 250),
  universe: SmartScreenerUniverseSchema.optional().default("all"),
  takerContext: z
    .union([TakerContextSchema, z.null()])
    .optional()
    .default(null),
});

export type ScreeningDsl = z.infer<typeof ScreeningDslSchema>;

function opToSymbol(op: ScreenFilterOp): string {
  if (op === "gt") return ">";
  if (op === "gte") return "≥";
  if (op === "lt") return "<";
  if (op === "lte") return "≤";
  return "=";
}

function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (!Number.isFinite(value)) return `${value}`;
  if (abs === 0) return "$0";

  if (abs >= 1e12)
    return `${sign}$${(abs / 1e12).toFixed(2).replace(/\.00$/, "")}T`;
  if (abs >= 1e9)
    return `${sign}$${(abs / 1e9).toFixed(2).replace(/\.00$/, "")}B`;
  if (abs >= 1e6)
    return `${sign}$${(abs / 1e6).toFixed(2).replace(/\.00$/, "")}M`;
  if (abs >= 1e3)
    return `${sign}$${(abs / 1e3).toFixed(2).replace(/\.00$/, "")}K`;

  if (abs >= 1) return `${sign}$${abs.toFixed(2).replace(/\.00$/, "")}`;
  if (abs >= 0.01)
    return `${sign}$${abs.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `${sign}$${abs.toPrecision(2)}`;
}

function formatValueByUnit(args: { unit: MetricUnit; value: number }): string {
  if (args.unit === "usd") return formatCompactUsd(args.value);
  if (args.unit === "percent")
    return `${args.value.toFixed(2).replace(/\.00$/, "")}%`;
  if (args.unit === "rank") return `${Math.floor(args.value)}`;
  if (args.unit === "ratio") return `${(args.value * 100).toFixed(0)}%`;
  return `${args.value}`;
}

/** Human-readable form of a single filter, e.g. "Market cap > $5M". */
export function formatDslFilter(
  filter: ScreeningDsl["filters"][number],
): string {
  const metric = getSmartScreenerMetric(filter.metricId);
  const label = metric?.label ?? filter.metricId;
  const op = opToSymbol(filter.op);
  const value = metric
    ? formatValueByUnit({ unit: metric.unit, value: filter.value })
    : String(filter.value);
  return `${label} ${op} ${value}`;
}

function dslUsesTakerMetrics(dsl: ScreeningDsl): boolean {
  const uses = (metricId: string) =>
    getSmartScreenerMetric(metricId)?.source === "taker";
  return (
    dsl.filters.some((f) => uses(f.metricId)) ||
    (dsl.sort ? uses(dsl.sort.metricId) : false)
  );
}

export function formatDslSummary(dsl: ScreeningDsl): string {
  const parts: Array<string> = [];
  for (const f of dsl.filters) {
    parts.push(formatDslFilter(f));
  }
  if (dsl.sort) {
    const metric = getSmartScreenerMetric(dsl.sort.metricId);
    const label = metric?.label ?? dsl.sort.metricId;
    parts.push(`Sort: ${label} ${dsl.sort.order === "desc" ? "↓" : "↑"}`);
  }
  if (dslUsesTakerMetrics(dsl)) {
    const ctx = dsl.takerContext;
    const range = ctx?.range ?? "24h";
    const exchange = ctx?.exchange ?? null;
    parts.push(`Taker: ${range}${exchange ? ` · ${exchange}` : ""}`);
  }
  return parts.join(" • ");
}
