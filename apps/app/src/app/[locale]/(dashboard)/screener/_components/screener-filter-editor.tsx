"use client";

import { Button } from "@v1/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@v1/ui/command";
import { Input } from "@v1/ui/input";
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

const OPS: ReadonlyArray<{
  value: ScreenFilterOp;
  symbol: string;
  label: string;
  keywords: ReadonlyArray<string>;
}> = [
  {
    value: "gt",
    symbol: ">",
    label: "greater than",
    keywords: [">", "gt", "more", "above", "over"],
  },
  {
    value: "lt",
    symbol: "<",
    label: "less than",
    keywords: ["<", "lt", "under", "below", "smaller"],
  },
  {
    value: "gte",
    symbol: "≥",
    label: "greater than or equal",
    keywords: [">=", "gte", "at least", "minimum"],
  },
  {
    value: "lte",
    symbol: "≤",
    label: "less than or equal",
    keywords: ["<=", "lte", "at most", "maximum"],
  },
  {
    value: "eq",
    symbol: "=",
    label: "equal to",
    keywords: ["=", "==", "eq", "exactly", "is"],
  },
];

/** Single keystrokes that pick an operator instantly in the op stage. */
const OP_QUICK_KEYS: Record<string, ScreenFilterOp> = {
  ">": "gt",
  "<": "lt",
  "=": "eq",
};

const METRIC_GROUPS = [
  { label: "Market", metrics: SMART_SCREENER_MARKET_METRICS },
  { label: "Technical", metrics: SMART_SCREENER_TECHNICAL_METRICS },
  { label: "Derivatives", metrics: SMART_SCREENER_TAKER_METRICS },
] as const;

/** Visible hover/selection against the white / zinc-900 popover surface.
 *  No transitions — selection needs to snap when scrubbing with the mouse or arrows. */
const FILTER_COMMAND_ITEM_CLASS =
  "cursor-pointer rounded-lg text-xs hover:bg-gray-100 hover:text-gray-900 aria-selected:bg-gray-100 aria-selected:text-gray-900 dark:hover:bg-zinc-800 dark:hover:text-white dark:aria-selected:bg-zinc-800 dark:aria-selected:text-white";

function unitPlaceholder(metricId: string): string {
  const metric = getSmartScreenerMetric(metricId);
  if (!metric) return "value";
  if (metric.unit === "usd") return "e.g. 200m or $1.5b";
  if (metric.unit === "percent") return "percent points, e.g. 10";
  if (metric.unit === "ratio") return "0..1 or 55%";
  if (metric.unit === "rank") return "e.g. 100";
  return "value";
}

type Stage = "metric" | "op" | "value";

/**
 * Staged, keyboard-first popover body for editing ONE filter (or creating one
 * when `filter` is null). Flow: type to search a metric → Enter → pick an
 * operator (type ">" / "<" / "=" or search "greater") → type a value → Enter
 * applies. Backspace on an empty input steps back a stage; the breadcrumb
 * chips jump back on click. Values are parsed and normalized through the SAME
 * zod schema the LLM path uses — "55%" and "200m" behave identically
 * everywhere.
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
  // Editing an existing filter jumps straight to the value stage; creating a
  // new one starts at metric search.
  const [stage, setStage] = React.useState<Stage>(
    filter != null ? "value" : "metric",
  );
  const [metricId, setMetricId] = React.useState<string | null>(
    filter?.metricId ?? null,
  );
  const [op, setOp] = React.useState<ScreenFilterOp>(filter?.op ?? "gt");
  const [search, setSearch] = React.useState("");
  const [rawValue, setRawValue] = React.useState<string>(
    filter != null ? String(filter.value) : "",
  );
  const [error, setError] = React.useState<string | null>(null);
  const valueInputRef = React.useRef<HTMLInputElement>(null);

  // Refocus the value input whenever we land on the value stage (autoFocus
  // only fires on mount, and the Input stays mounted across stage changes
  // when editing).
  React.useEffect(() => {
    if (stage === "value") valueInputRef.current?.focus();
  }, [stage]);

  const metric = metricId ? getSmartScreenerMetric(metricId) : null;
  const opDef = OPS.find((o) => o.value === op);

  const goTo = (next: Stage) => {
    setSearch("");
    setError(null);
    setStage(next);
  };

  const pickMetric = (id: string) => {
    setMetricId(id);
    goTo("op");
  };

  const pickOp = (next: ScreenFilterOp) => {
    setOp(next);
    goTo("value");
  };

  const apply = () => {
    if (!metricId) return;
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
    <div className="flex w-[200px] flex-col gap-2">
      {/* Breadcrumb of choices made so far — click to jump back. */}
      {(metric || stage !== "metric") && (
        <div className="flex flex-wrap items-center gap-1">
          {metric ? (
            <button
              type="button"
              onClick={() => goTo("metric")}
              className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary/80 hover:bg-primary/15"
            >
              {metric.label}
            </button>
          ) : null}
          {metric && stage === "value" && opDef ? (
            <button
              type="button"
              onClick={() => goTo("op")}
              className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs tabular-nums text-primary/80 hover:bg-primary/15"
            >
              {opDef.symbol}
            </button>
          ) : null}
        </div>
      )}

      {stage === "metric" ? (
        <Command className="rounded-lg" loop>
          <CommandInput
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Type a filter…"
            className="h-8 text-xs pl-2"
          />
          <CommandList className="screener-filter-scroll max-h-56 scrollbar-hide">
            <CommandEmpty className="py-4 text-xs text-muted-foreground">
              No matching filter.
            </CommandEmpty>
            {METRIC_GROUPS.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.metrics.map((m) => (
                  <CommandItem
                    key={m.id}
                    // cmdk 0.2.x has no `keywords` prop — bake synonyms into
                    // the match value (children still render just the label).
                    value={`${m.label} ${m.synonyms.join(" ")}`}
                    onSelect={() => pickMetric(m.id)}
                    className={FILTER_COMMAND_ITEM_CLASS}
                  >
                    {m.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      ) : null}

      {stage === "op" ? (
        <Command className="rounded-lg" loop>
          <CommandInput
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Condition… (try > < =)"
            className="h-8 text-xs pl-2"
            onKeyDown={(event) => {
              // Backspace on empty steps back to metric search.
              if (event.key === "Backspace" && search === "") {
                event.preventDefault();
                goTo("metric");
                return;
              }
              // Single-key shortcuts: ">" "<" "=" pick instantly.
              const quick = OP_QUICK_KEYS[event.key];
              if (quick && search === "") {
                event.preventDefault();
                pickOp(quick);
              }
            }}
          />
          <CommandList className="screener-filter-scroll max-h-56 scrollbar-hide">
            <CommandEmpty className="py-4 text-xs text-muted-foreground">
              No matching condition.
            </CommandEmpty>
            <CommandGroup heading="Condition">
              {OPS.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.keywords.join(" ")}`}
                  onSelect={() => pickOp(o.value)}
                  className={FILTER_COMMAND_ITEM_CLASS}
                >
                  <span className="w-5 tabular-nums text-muted-foreground">
                    {o.symbol}
                  </span>
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      ) : null}

      {stage === "value" ? (
        <>
          <Input
            ref={valueInputRef}
            autoFocus
            value={rawValue}
            onChange={(event) => setRawValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
                return;
              }
              // Backspace on empty steps back to the operator stage.
              if (event.key === "Backspace" && rawValue === "") {
                event.preventDefault();
                goTo("op");
              }
            }}
            placeholder={metricId ? unitPlaceholder(metricId) : "value"}
            className="h-8 rounded-lg text-xs"
            aria-label="Value"
          />

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
              <span className="text-[10px] text-muted-foreground">
                Enter to apply · Backspace to go back
              </span>
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
        </>
      ) : null}
    </div>
  );
}
