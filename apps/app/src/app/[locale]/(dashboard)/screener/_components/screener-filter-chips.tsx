"use client";

import { Badge } from "@v1/ui/badge";
import { Button } from "@v1/ui/button";
import { Kbd } from "@v1/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@v1/ui/popover";
import { Plus, X } from "lucide-react";
import * as React from "react";

import { isTypingContext } from "./screener-shortcuts";

import { getSmartScreenerMetric } from "@/lib/smart-screener/metric-registry";
import {
  type ScreeningDsl,
  ScreeningDslSchema,
  formatDslFilter,
} from "@/lib/smart-screener/screening-dsl";
import { useScreenerContext } from "./screener-context";
import { ScreenerFilterEditor } from "./screener-filter-editor";

type ScreenFilter = ScreeningDsl["filters"][number];

// Filters have no id field, so cache a stable key per filter object. Object
// identity survives removals/edits of *other* filters (the array is rebuilt
// but untouched items are reused), keeping React state on the right chip.
const filterKeys = new WeakMap<ScreenFilter, string>();
let filterKeySeq = 0;
function getFilterKey(filter: ScreenFilter): string {
  let key = filterKeys.get(filter);
  if (!key) {
    key = `filter-${filterKeySeq++}`;
    filterKeys.set(filter, key);
  }
  return key;
}

function ChipShell({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <Badge
      variant="secondary"
      className="group h-6 gap-1 pr-1 py-0 bg-primary/5 text-primary/50 hover:text-primary cursor-crosshair border-border border-dashed flex-shrink-0"
    >
      <span className="text-xs font-medium opacity-50">{label}</span>
      <div className="h-[24px] w-[1px] bg-border mx-1" />
      <span className="text-xs tabular-nums">{value}</span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-1 h-4 w-4 p-0 rounded-md group-hover:bg-blue-500"
        aria-label={`Remove ${label} filter`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </Badge>
  );
}

function FilterChip({
  filter,
  index,
  dsl,
  setDsl,
}: {
  filter: ScreenFilter;
  index: number;
  dsl: ScreeningDsl;
  setDsl: (dsl: ScreeningDsl | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const metric = getSmartScreenerMetric(filter.metricId);

  const removeFilter = () => {
    const filters = dsl.filters.filter((_, i) => i !== index);
    setDsl(filters.length === 0 && !dsl.sort ? null : { ...dsl, filters });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The Badge wrapper is non-interactive; the edit trigger and remove
          control are sibling <button>s so neither nests inside the other. */}
      <Badge
        variant="secondary"
        className="group h-6 gap-1 pr-1 py-0 bg-primary/5 text-primary/50 hover:text-primary cursor-pointer border-border border-dashed flex-shrink-0"
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 items-center"
            aria-label={`Edit ${metric?.label ?? filter.metricId} filter`}
          >
            <span className="text-xs tabular-nums">
              {formatDslFilter(filter)}
            </span>
          </button>
        </PopoverTrigger>
        <button
          type="button"
          aria-label="Remove filter"
          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-md p-0 group-hover:bg-blue-500"
          onClick={(event) => {
            event.stopPropagation();
            removeFilter();
          }}
        >
          <X className="h-3 w-3" />
        </button>
      </Badge>
      <PopoverContent
        align="start"
        // Cover the chip instead of dropping below it (see AddFilterChip).
        sideOffset={-26}
        alignOffset={-4}
        className="w-auto rounded-xl bg-white p-3 dark:bg-zinc-900"
      >
        <ScreenerFilterEditor
          filter={filter}
          onApply={(next) => {
            const filters = dsl.filters.map((f, i) => (i === index ? next : f));
            setDsl({ ...dsl, filters });
            setOpen(false);
          }}
          onRemove={() => {
            removeFilter();
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function AddFilterChip({
  dsl,
  setDsl,
}: {
  dsl: ScreeningDsl | null;
  setDsl: (dsl: ScreeningDsl | null) => void;
}) {
  const [open, setOpen] = React.useState(false);

  // Single-letter shortcut: F opens the add-filter dropdown. Guarded so it
  // never fires while typing in an input, dialog, or popover.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f" || open || isTypingContext(event)) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 rounded-md border border-dashed border-border px-2 pr-1 text-xs text-primary/50 hover:text-primary hover:ring hover:ring-2 hover:ring-white/10"
          aria-label="Add filter"
        >
          <Plus className="h-3 w-3" />
          <span>Add filter</span>
          <Kbd className="ml-0.5 h-4 px-1 text-[10px]">F</Kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={-40}
        alignOffset={-0}
        className="w-auto rounded-xl bg-white px-1.5 py-1.5 dark:bg-zinc-900"
      >
        <ScreenerFilterEditor
          filter={null}
          onApply={(next) => {
            if (dsl) {
              setDsl({ ...dsl, filters: [...dsl.filters, next] });
            } else {
              setDsl(ScreeningDslSchema.parse({ filters: [next] }));
            }
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The interpretation preview AND the manual filter surface: one editable chip
 * per DSL filter, plus search/sort/limit/taker-context chips. Edits re-execute
 * via the execute-only path — no LLM round-trip.
 */
export function ScreenerFilterChips() {
  const { dsl, setDsl, sort, setSort, q, setQ } = useScreenerContext();

  const chips: Array<React.ReactNode> = [];

  if (q.trim()) {
    chips.push(
      <ChipShell
        key="q"
        label="Search"
        value={q.trim()}
        onRemove={() => setQ("")}
      />,
    );
  }

  if (dsl) {
    dsl.filters.forEach((filter, index) => {
      chips.push(
        <FilterChip
          key={getFilterKey(filter)}
          filter={filter}
          index={index}
          dsl={dsl}
          setDsl={setDsl}
        />,
      );
    });

    if (dsl.sort) {
      const metric = getSmartScreenerMetric(dsl.sort.metricId);
      chips.push(
        <ChipShell
          key="dsl-sort"
          label="Sort"
          value={`${metric?.label ?? dsl.sort.metricId} ${dsl.sort.order === "desc" ? "↓" : "↑"}`}
          onRemove={() => {
            const next = { ...dsl, sort: null };
            setDsl(next.filters.length === 0 ? null : next);
          }}
        />,
      );
    }

    if (dsl.limit !== 250) {
      chips.push(
        <ChipShell
          key="limit"
          label="Limit"
          value={String(dsl.limit)}
          onRemove={() => setDsl({ ...dsl, limit: 250 })}
        />,
      );
    }

    if (
      dsl.takerContext &&
      (dsl.takerContext.range !== "24h" || dsl.takerContext.exchange)
    ) {
      chips.push(
        <ChipShell
          key="taker-ctx"
          label="Taker"
          value={`${dsl.takerContext.range}${dsl.takerContext.exchange ? ` · ${dsl.takerContext.exchange}` : ""}`}
          onRemove={() => setDsl({ ...dsl, takerContext: null })}
        />,
      );
    }
  }

  if (sort) {
    chips.push(
      <ChipShell
        key="sort"
        label="Sort"
        value={`${sort.key} ${sort.desc ? "↓" : "↑"}`}
        onRemove={() => setSort(null)}
      />,
    );
  }

  return (
    <div className="flex flex-wrap gap-2 min-w-0 items-center">
      {chips}
      <AddFilterChip dsl={dsl} setDsl={setDsl} />
    </div>
  );
}
