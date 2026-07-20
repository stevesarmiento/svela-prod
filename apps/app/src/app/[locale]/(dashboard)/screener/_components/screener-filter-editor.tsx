"use client";

import { Button } from "@v1/ui/button";
import { Input } from "@v1/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@v1/ui/select";
import * as React from "react";

import { SMART_SCREENER_MARKET_METRICS } from "@/lib/smart-screener/metric-catalog";
import { getSmartScreenerMetric } from "@/lib/smart-screener/metric-registry";
import {
  type ScreenFilterOp,
  ScreenFilterSchema,
  type ScreeningDsl,
} from "@/lib/smart-screener/screening-dsl";
import { SMART_SCREENER_TAKER_METRICS } from "@/lib/smart-screener/taker-metrics";
import { SMART_SCREENER_TECHNICAL_METRICS } from "@/lib/smart-screener/technical-metrics";

type ScreenFilter = ScreeningDsl["filters"][number];

const OPS: ReadonlyArray<{ value: ScreenFilterOp; label: string }> = [
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "eq", label: "=" },
];

const METRIC_GROUPS = [
  { label: "Market", metrics: SMART_SCREENER_MARKET_METRICS },
  { label: "Technical", metrics: SMART_SCREENER_TECHNICAL_METRICS },
  { label: "Derivatives", metrics: SMART_SCREENER_TAKER_METRICS },
] as const;

function unitPlaceholder(metricId: string): string {
  const metric = getSmartScreenerMetric(metricId);
  if (!metric) return "value";
  if (metric.unit === "usd") return "e.g. 200m or $1.5b";
  if (metric.unit === "percent") return "percent points, e.g. 10";
  if (metric.unit === "ratio") return "0..1 or 55%";
  if (metric.unit === "rank") return "e.g. 100";
  return "value";
}

/**
 * Popover body for editing ONE filter (or creating one when `filter` is null).
 * Values are parsed and normalized through the SAME zod schema the LLM path
 * uses — "55%" and "200m" behave identically everywhere.
 */
export function ScreenerFilterEditor({
  filter,
  onApply,
  onRemove,
}: {
  filter: ScreenFilter | null;
  onApply: (filter: ScreenFilter) => void;
  onRemove?: () => void;
}) {
  const [metricId, setMetricId] = React.useState<string>(
    filter?.metricId ?? "market_cap_usd",
  );
  const [op, setOp] = React.useState<ScreenFilterOp>(filter?.op ?? "gt");
  const [rawValue, setRawValue] = React.useState<string>(
    filter != null ? String(filter.value) : "",
  );
  const [error, setError] = React.useState<string | null>(null);

  const apply = () => {
    const parsed = ScreenFilterSchema.safeParse({
      metricId,
      op,
      value: rawValue,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid value");
      return;
    }
    setError(null);
    onApply(parsed.data);
  };

  return (
    <div className="flex w-64 flex-col gap-2.5">
      <Select value={metricId} onValueChange={(next) => setMetricId(next)}>
        <SelectTrigger className="h-8 rounded-lg text-xs" aria-label="Metric">
          <SelectValue placeholder="Metric" />
        </SelectTrigger>
        {/* Panel + row-item styling matches the top-nav profile dropdown
            (see top-nav-profile-client.tsx): solid bg, rounded-xl. */}
        <SelectContent className="z-[10001] rounded-xl bg-white dark:bg-zinc-900">
          {METRIC_GROUPS.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="text-xs font-medium text-muted-foreground">
                {group.label}
              </SelectLabel>
              {group.metrics.map((metric) => (
                <SelectItem
                  key={metric.id}
                  value={metric.id}
                  className="rounded-xl text-xs"
                >
                  {metric.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Select
          value={op}
          onValueChange={(next) => setOp(next as ScreenFilterOp)}
        >
          <SelectTrigger
            className="h-8 w-16 rounded-lg text-xs"
            aria-label="Operator"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[10001] rounded-xl bg-white dark:bg-zinc-900">
            {OPS.map((o) => (
              <SelectItem
                key={o.value}
                value={o.value}
                className="rounded-xl text-xs"
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={rawValue}
          onChange={(event) => setRawValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
          placeholder={unitPlaceholder(metricId)}
          className="h-8 flex-1 rounded-lg text-xs"
          aria-label="Value"
        />
      </div>

      {error ? <p className="text-xs text-rose-400">{error}</p> : null}

      <div className="flex items-center justify-between gap-2 pt-1">
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300"
            onClick={onRemove}
          >
            Remove
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={apply}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
