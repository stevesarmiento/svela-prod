"use client";

import type { TakerFilterState } from "@/hooks/use-watchlist-data";
import { shouldApplySmartScreenerResult } from "@/lib/smart-screener/client-result";
import { promptLooksLikeConstraints } from "@/lib/smart-screener/prompt-gating";
import {
  type SmartScreenerScreenResponse,
  SmartScreenerScreenResponseSchema,
} from "@/lib/smart-screener/screen-api";
import { formatDslSummary } from "@/lib/smart-screener/screening-dsl";
import { Button } from "@v1/ui/button";
import { cn } from "@v1/ui/cn";
import { Kbd } from "@v1/ui/kbd";
import * as React from "react";
import { toast } from "sonner";
import { IconArrowTurnDownRight } from "symbols-react";
import { SCREENER_RANGE_DEFAULTS } from "./screener-filter-constants";
import {
  type ScreenerNaturalLanguageAction,
  doesScreenerQueryLookLikeFilterIntent,
  parseScreenerNaturalLanguageActions,
} from "./screener-filter-utils";
import type { ScreenerTableStatus } from "./screener-table-types";

interface ScreenerSmartPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeFilter: "all" | "positive" | "negative";
  sortBy: "name" | "price" | "change" | "marketCap" | "volume";
  sortOrder: "asc" | "desc";
  takerFilter: TakerFilterState | null;
  onSearchTextChange: (value: string) => void;
  onPriceRangeChange: (range: [number, number]) => void;
  onMarketCapRangeChange: (range: [number, number]) => void;
  onVolumeRangeChange: (range: [number, number]) => void;
  onChangeFilterChange: (value: "all" | "positive" | "negative") => void;
  onSortByChange: (
    value: "name" | "price" | "change" | "marketCap" | "volume",
  ) => void;
  onSortOrderChange: (value: "asc" | "desc") => void;
  onTakerFilterChange: (value: TakerFilterState | null) => void;
  onSmartScreenerStatusChange?: (status: ScreenerTableStatus | null) => void;
  onSmartScreenerScreenResultChange?: (
    result: SmartScreenerScreenResponse | null,
  ) => void;
}

export function ScreenerSmartPromptDialog({
  open,
  onOpenChange,
  changeFilter,
  sortBy,
  sortOrder,
  takerFilter,
  onSearchTextChange,
  onPriceRangeChange,
  onMarketCapRangeChange,
  onVolumeRangeChange,
  onChangeFilterChange,
  onSortByChange,
  onSortOrderChange,
  onTakerFilterChange,
  onSmartScreenerStatusChange,
  onSmartScreenerScreenResultChange,
}: ScreenerSmartPromptDialogProps) {
  const CLOSE_ANIMATION_MS = 75;

  const [draft, setDraft] = React.useState("");
  const [isInterpreting, setIsInterpreting] = React.useState(false);
  /** Keeps the tree mounted briefly after `open` becomes false so exit CSS can run. */
  const [isVisible, setIsVisible] = React.useState(open);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const interpretAbortRef = React.useRef<AbortController | null>(null);
  const intentConfidenceThreshold = 0.6;

  React.useEffect(() => {
    if (open) {
      setIsVisible(true);
      return;
    }
    const id = window.setTimeout(() => setIsVisible(false), CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(id);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setDraft("");
    setIsInterpreting(false);
    interpretAbortRef.current?.abort();
    interpretAbortRef.current = null;

    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  const applyNaturalLanguageActions = React.useCallback(
    (actions: Array<ScreenerNaturalLanguageAction>) => {
      for (const action of actions) {
        if (action.kind === "change") {
          onChangeFilterChange(action.value);
          continue;
        }
        if (action.kind === "sortBy") {
          onSortByChange(action.value);
          continue;
        }
        if (action.kind === "sortOrder") {
          onSortOrderChange(action.value);
          continue;
        }
        if (action.kind === "priceRange") {
          onPriceRangeChange(action.value);
          continue;
        }
        if (action.kind === "marketCapRange") {
          onMarketCapRangeChange(action.value);
          continue;
        }
        onVolumeRangeChange(action.value);
      }
    },
    [
      onChangeFilterChange,
      onMarketCapRangeChange,
      onPriceRangeChange,
      onSortByChange,
      onSortOrderChange,
      onVolumeRangeChange,
    ],
  );

  const applyServerActions = React.useCallback(
    (serverActions: Array<unknown>) => {
      for (const action of serverActions) {
        if (typeof action !== "object" || action === null) continue;
        const kind = (action as Record<string, unknown>).kind;
        const value = (action as Record<string, unknown>).value;

        if (kind === "changeFilter") {
          if (value === "all" || value === "positive" || value === "negative") {
            onChangeFilterChange(value);
          }
          continue;
        }

        if (kind === "sortBy") {
          if (
            value === "name" ||
            value === "price" ||
            value === "change" ||
            value === "marketCap" ||
            value === "volume"
          ) {
            onSortByChange(value);
          }
          continue;
        }

        if (kind === "sortOrder") {
          if (value === "asc" || value === "desc") onSortOrderChange(value);
          continue;
        }

        if (kind === "takerFilter") {
          if (typeof value !== "object" || value === null) continue;
          const record = value as Record<string, unknown>;

          const range =
            record.range === "1h" ||
            record.range === "4h" ||
            record.range === "12h" ||
            record.range === "24h" ||
            record.range === "7d"
              ? (record.range as TakerFilterState["range"])
              : ("24h" as const);
          const exchange =
            record.exchange === null || typeof record.exchange === "string"
              ? record.exchange
              : null;
          const minBuyRatioRaw =
            record.minBuyRatio === null ||
            typeof record.minBuyRatio === "number"
              ? record.minBuyRatio
              : null;
          const minBuyVolumeUsdRaw =
            record.minBuyVolumeUsd === null ||
            typeof record.minBuyVolumeUsd === "number"
              ? record.minBuyVolumeUsd
              : null;
          const minTotalVolumeUsdRaw =
            record.minTotalVolumeUsd === null ||
            typeof record.minTotalVolumeUsd === "number"
              ? record.minTotalVolumeUsd
              : null;
          const minNetBuyUsdRaw =
            record.minNetBuyUsd === null ||
            typeof record.minNetBuyUsd === "number"
              ? record.minNetBuyUsd
              : null;
          const requireBuyGreaterThanSell =
            typeof record.requireBuyGreaterThanSell === "boolean"
              ? record.requireBuyGreaterThanSell
              : false;

          const minBuyRatio =
            minBuyRatioRaw == null
              ? null
              : Math.max(
                  0,
                  Math.min(
                    1,
                    Number.isFinite(minBuyRatioRaw) ? minBuyRatioRaw : 0,
                  ),
                );
          const minNetBuyUsd =
            minNetBuyUsdRaw == null
              ? null
              : Math.max(
                  0,
                  Number.isFinite(minNetBuyUsdRaw) ? minNetBuyUsdRaw : 0,
                );
          const minBuyVolumeUsd =
            minBuyVolumeUsdRaw == null
              ? null
              : Math.max(
                  0,
                  Number.isFinite(minBuyVolumeUsdRaw) ? minBuyVolumeUsdRaw : 0,
                );
          const minTotalVolumeUsd =
            minTotalVolumeUsdRaw == null
              ? null
              : Math.max(
                  0,
                  Number.isFinite(minTotalVolumeUsdRaw)
                    ? minTotalVolumeUsdRaw
                    : 0,
                );

          onTakerFilterChange({
            range,
            exchange,
            minBuyRatio,
            minBuyVolumeUsd,
            minTotalVolumeUsd,
            minNetBuyUsd,
            requireBuyGreaterThanSell,
          });
        }
      }
    },
    [
      onChangeFilterChange,
      onSortByChange,
      onSortOrderChange,
      onTakerFilterChange,
    ],
  );

  const runServerScreener = React.useCallback(
    async (trimmed: string) => {
      interpretAbortRef.current?.abort();
      const abortController = new AbortController();
      interpretAbortRef.current = abortController;

      setIsInterpreting(true);
      onSmartScreenerStatusChange?.({
        kind: "interpreting",
        text: "Interpreting…",
      });
      try {
        const response = await fetch("/api/smart-screener/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            text: trimmed,
            surface: "screener",
          }),
        });

        const json: unknown = await response.json().catch(() => null);
        const parsed = SmartScreenerScreenResponseSchema.safeParse(json);
        if (!parsed.success) {
          toast.error("Try again", {
            description:
              "Couldn’t interpret that. Try rephrasing with concrete constraints.",
          });
          return;
        }

        const data = parsed.data;
        if (data.userMessage) {
          if (data.ok)
            toast.message("Smart screener", { description: data.userMessage });
          else toast.error("Try again", { description: data.userMessage });
        }

        if (!data.ok) return;

        onSearchTextChange("");
        onPriceRangeChange([0, SCREENER_RANGE_DEFAULTS.priceMax]);
        onMarketCapRangeChange([0, SCREENER_RANGE_DEFAULTS.marketCapMax]);
        onVolumeRangeChange([0, SCREENER_RANGE_DEFAULTS.volumeMax]);
        onChangeFilterChange("all");
        onSortByChange("marketCap");
        onSortOrderChange("desc");
        onTakerFilterChange(null);
        onSmartScreenerScreenResultChange?.({
          ...data,
          summary: formatDslSummary(data.dsl),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        toast.error("Smart screener unavailable", {
          description:
            "Couldn’t interpret that right now. Try again in a moment.",
        });
      } finally {
        setIsInterpreting(false);
        onSmartScreenerStatusChange?.(null);
      }
    },
    [
      onChangeFilterChange,
      onMarketCapRangeChange,
      onPriceRangeChange,
      onSearchTextChange,
      onSmartScreenerScreenResultChange,
      onSmartScreenerStatusChange,
      onSortByChange,
      onSortOrderChange,
      onTakerFilterChange,
      onVolumeRangeChange,
    ],
  );

  const interpretAndApply = React.useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      const looksLikeDerivatives =
        /\b(taker|net\s*buy|open\s*interest|oi\b|liquidat|funding)\b/i.test(
          trimmed,
        );

      const isAdvancedScreenerQuery =
        /\b(fdv|ath|atl|drawdown|return|volatility|trend|momentum)\b/i.test(
          trimmed,
        ) ||
        /\b(7d|30d|24h)\b/i.test(trimmed) ||
        /\b(range)\b/i.test(trimmed);

      const shouldUseServerScreener =
        !looksLikeDerivatives &&
        (isAdvancedScreenerQuery || promptLooksLikeConstraints(trimmed));

      if (shouldUseServerScreener) {
        await runServerScreener(trimmed);
        return;
      }

      const actions = parseScreenerNaturalLanguageActions(trimmed);

      if (
        actions.length === 0 &&
        trimmed.split(/\s+/g).length === 1 &&
        trimmed.length <= 18
      ) {
        onSearchTextChange(trimmed);
        return;
      }

      if (actions.length > 0) {
        applyNaturalLanguageActions(actions);
        return;
      }

      const looksLikeIntent = doesScreenerQueryLookLikeFilterIntent(trimmed);
      if (!looksLikeIntent) {
        onSearchTextChange(trimmed);
        return;
      }

      if (!looksLikeDerivatives) {
        await runServerScreener(trimmed);
        return;
      }

      interpretAbortRef.current?.abort();
      const abortController = new AbortController();
      interpretAbortRef.current = abortController;

      setIsInterpreting(true);
      onSmartScreenerStatusChange?.({
        kind: "interpreting",
        text: "Interpreting…",
      });
      try {
        const response = await fetch("/api/watchlist-filters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            text: trimmed,
            surface: "screener",
            watchlistGroups: [],
            current: {
              watchlistGroupId: null,
              changeFilter,
              sortBy,
              sortOrder,
              takerFilter,
            },
          }),
        });

        const data = (await response.json().catch(() => null)) as unknown;
        const obj =
          typeof data === "object" && data !== null
            ? (data as Record<string, unknown>)
            : null;
        const confidence =
          typeof obj?.confidence === "number" ? obj.confidence : 0;
        const serverActions = Array.isArray(obj?.actions)
          ? (obj.actions as Array<unknown>)
          : [];

        const shouldApplyActions = shouldApplySmartScreenerResult({
          ok: response.ok,
          confidence,
          actionsCount: serverActions.length,
          threshold: intentConfidenceThreshold,
        });
        if (!shouldApplyActions) {
          toast.error("Try again", {
            description:
              "Couldn’t confidently interpret that. Try rephrasing (e.g. “taker buy > sell, net buy > $10m”).",
          });
          return;
        }

        applyServerActions(serverActions);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        toast.error("Smart screener unavailable", {
          description:
            "Couldn’t interpret that right now. Try again in a moment.",
        });
      } finally {
        setIsInterpreting(false);
        onSmartScreenerStatusChange?.(null);
      }
    },
    [
      applyNaturalLanguageActions,
      applyServerActions,
      changeFilter,
      onSearchTextChange,
      onSmartScreenerStatusChange,
      runServerScreener,
      sortBy,
      sortOrder,
      takerFilter,
    ],
  );

  const examples = React.useMemo(
    () => [
      "taker buy > sell, net buy > $10m",
      "market cap over 500m, price under 0.10",
      "top gainers with > 100m volume",
    ],
    [],
  );

  if (!isVisible) return null;

  const dialogState = open ? "open" : "closed";

  return (
    <div className="fixed inset-0 z-[10000] flex items-start justify-center px-4 pt-40">
      <button
        type="button"
        aria-label="Close smart screener"
        data-state={dialogState}
        className={cn(
          "absolute inset-0 bg-black/20 backdrop-blur-sm",
          "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out",
          "motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0",
          "motion-safe:duration-75 motion-safe:ease-out motion-safe:data-[state=closed]:ease-in",
        )}
        onClick={() => onOpenChange(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Smart screener"
        data-state={dialogState}
        className={cn(
          "relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-gray-200/50 bg-white/95 shadow-[0_3px_8px_oklch(0_0_0_/_0.1),0_2px_4px_oklch(0_0_0_/_0.06)] backdrop-blur-md dark:border-transparent dark:bg-zinc-900/80 dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_30px_oklch(0.2978_0.0083_317.72_/_0.9),0_4px_16px_oklch(0_0_0_/_0.4)]",
          "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out",
          "motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0",
          "motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95",
          "motion-safe:duration-75 motion-safe:ease-out motion-safe:data-[state=closed]:ease-in",
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form
          id="smart-screener-prompt-form"
          className="pb-16"
          onSubmit={(event) => {
            event.preventDefault();
            const prompt = draft;
            onOpenChange(false);
            setDraft("");
            void interpretAndApply(prompt);
          }}
        >
          <div className="flex min-h-12 items-center gap-3 border-b border-black/60 pb-6 p-6">
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Describe what you're looking for..."
              onKeyDown={(event) => {
                if (event.key === "Escape") onOpenChange(false);
              }}
              className="min-w-0 flex-1 border-0 bg-transparent text-base text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <button
              type="button"
              aria-label="Close smart screener"
              className="shrink-0 rounded-md"
              onClick={() => onOpenChange(false)}
            >
              <Kbd className="bg-primary/10 font-mono px-2 w-8 uppercase text-xs">
                esc
              </Kbd>
            </button>
          </div>

          <div className="flex flex-wrap gap-2 p-5 border-t border-white/5 pt-3">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-dashed border-primary/20 bg-zinc-600/30 py-0 pl-1.5 pr-2 text-primary/80",
                  "cursor-pointer transition-colors hover:text-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
                onClick={() => {
                  onOpenChange(false);
                  setDraft("");
                  void interpretAndApply(example);
                }}
              >
                <span className="max-w-[min(100%,20rem)] text-left text-xs text-pretty">
                  {example}
                </span>
              </button>
            ))}
          </div>
        </form>

        <Button
          type="submit"
          size="sm"
          variant="default"
          form="smart-screener-prompt-form"
          aria-label="Run smart screener"
          className="absolute h-7 bottom-4 right-4 !rounded-lg gap-2 inline-flex"
          disabled={draft.trim().length === 0 || isInterpreting}
        >
          <IconArrowTurnDownRight className="size-2.5 fill-primary/70" />
          <span className="text-xs uppercase">Enter</span>
        </Button>
      </div>
    </div>
  );
}
