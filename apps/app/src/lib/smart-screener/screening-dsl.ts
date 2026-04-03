import { z } from "zod"

import { SMART_SCREENER_METRIC_IDS, getSmartScreenerMetric } from "./metric-registry"
import type { MetricUnit } from "./metric-catalog"
import { IntegerSchema, RatioSchema, UsdAmountSchema, PercentPointsSchema } from "./number-coercions"

function coerceNumber(value: unknown): number | unknown {
  if (typeof value === "number") return value
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (!trimmed) return value

  // Prefer USD parsing for compact amounts like 200m / $200m / 1.2b.
  if (/^[\d$]/.test(trimmed)) {
    const usd = UsdAmountSchema.safeParse(trimmed)
    if (usd.success) return usd.data
  }

  // Percent points parsing when it looks like a percent.
  if (/%\\s*$/.test(trimmed)) {
    const pct = PercentPointsSchema.safeParse(trimmed)
    if (pct.success) return pct.data
  }

  const parsed = Number.parseFloat(trimmed.replaceAll(",", ""))
  return Number.isFinite(parsed) ? parsed : value
}

const MetricIdSchema = z
  .string()
  .min(1)
  .refine((id) => SMART_SCREENER_METRIC_IDS.includes(id), "Unknown metricId")

export const ScreenFilterOpSchema = z.enum(["gt", "gte", "lt", "lte", "eq"])
export type ScreenFilterOp = z.infer<typeof ScreenFilterOpSchema>

export const ScreenFilterSchema = z
  .object({
    metricId: MetricIdSchema,
    op: ScreenFilterOpSchema,
    value: z.preprocess(coerceNumber, z.number()),
  })
  .superRefine((filter, ctx) => {
    const metric = getSmartScreenerMetric(filter.metricId)
    if (!metric) return

    const unit: MetricUnit = metric.unit
    const v = filter.value
    if (!Number.isFinite(v)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Value must be a finite number" })
      return
    }

    if (unit === "usd") {
      if (v < 0) ctx.addIssue({ code: "custom", path: ["value"], message: "USD value must be >= 0" })
      return
    }

    if (unit === "ratio") {
      const parsed = RatioSchema.safeParse(v)
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Ratio must be 0..1 (or a % like 55%)" })
      }
      return
    }

    if (unit === "rank") {
      const parsed = IntegerSchema.safeParse(v)
      if (!parsed.success || parsed.data < 1) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Rank must be an integer >= 1" })
      }
    }
  })

export const ScreenSortSchema = z.object({
  metricId: MetricIdSchema,
  order: z.enum(["asc", "desc"]),
})

export const SmartScreenerUniverseSchema = z.enum(["all", "current", "watchlist"])

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
})

export type ScreeningDsl = z.infer<typeof ScreeningDslSchema>

function opToSymbol(op: ScreenFilterOp): string {
  if (op === "gt") return ">"
  if (op === "gte") return "≥"
  if (op === "lt") return "<"
  if (op === "lte") return "≤"
  return "="
}

function formatCompactUsd(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""

  if (!Number.isFinite(value)) return `${value}`
  if (abs === 0) return "$0"

  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2).replace(/\\.00$/, "")}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2).replace(/\\.00$/, "")}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2).replace(/\\.00$/, "")}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2).replace(/\\.00$/, "")}K`

  if (abs >= 1) return `${sign}$${abs.toFixed(2).replace(/\\.00$/, "")}`
  if (abs >= 0.01) return `${sign}$${abs.toFixed(4).replace(/0+$/, "").replace(/\\.$/, "")}`
  return `${sign}$${abs.toPrecision(2)}`
}

function formatValueByUnit(args: { unit: MetricUnit; value: number }): string {
  if (args.unit === "usd") return formatCompactUsd(args.value)
  if (args.unit === "percent") return `${args.value.toFixed(2).replace(/\\.00$/, "")}%`
  if (args.unit === "rank") return `${Math.floor(args.value)}`
  if (args.unit === "ratio") return `${(args.value * 100).toFixed(0)}%`
  return `${args.value}`
}

export function formatDslSummary(dsl: ScreeningDsl): string {
  const parts: Array<string> = []
  for (const f of dsl.filters) {
    const metric = getSmartScreenerMetric(f.metricId)
    const label = metric?.label ?? f.metricId
    const op = opToSymbol(f.op)
    const value =
      metric ? formatValueByUnit({ unit: metric.unit, value: f.value }) : String(f.value)
    parts.push(`${label} ${op} ${value}`)
  }
  if (dsl.sort) {
    const metric = getSmartScreenerMetric(dsl.sort.metricId)
    const label = metric?.label ?? dsl.sort.metricId
    parts.push(`Sort: ${label} ${dsl.sort.order === "desc" ? "↓" : "↑"}`)
  }
  return parts.join(" • ")
}

