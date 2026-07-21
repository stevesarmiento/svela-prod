"use client";

import { Button } from "@v1/ui/button";
import { cn } from "@v1/ui/cn";
import { Kbd } from "@v1/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import dynamic from "next/dynamic";
import * as React from "react";
import { IconSparkles } from "symbols-react";

import { useScreenerContext } from "./screener-context";
import { ScreenerFilterChips } from "./screener-filter-chips";
import { isTypingContext } from "./screener-shortcuts";

function loadScreenerSmartPromptDialog() {
  return import("./screener-smart-prompt-dialog");
}

const LazyScreenerSmartPromptDialog = dynamic(
  () =>
    loadScreenerSmartPromptDialog().then(
      (module) => module.ScreenerSmartPromptDialog,
    ),
  { ssr: false, loading: () => null },
);

/**
 * Smart Screener button (S) + editable filter chips + honest coverage
 * caption. All state lives in ScreenerContext (URL-backed) — no prop drill.
 */
export function ScreenerFiltersBar() {
  const { dsl, q, sort, clearAll, results } = useScreenerContext();
  const [shouldLoadPromptDialog, setShouldLoadPromptDialog] =
    React.useState(false);
  const [isPromptDialogOpen, setIsPromptDialogOpen] = React.useState(false);

  const hasActiveFilters = dsl !== null || q.trim().length > 0 || sort !== null;

  const preloadPromptDialog = React.useCallback(() => {
    setShouldLoadPromptDialog((loaded) => {
      if (!loaded) void loadScreenerSmartPromptDialog();
      return true;
    });
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Single-letter shortcut: S opens Smart Screener. Guarded so it never
      // fires while typing (inputs, dialogs, popovers) or with modifiers held
      // — ⌘F stays the browser's native find.
      if (
        event.key.toLowerCase() === "s" &&
        !isPromptDialogOpen &&
        !isTypingContext(event)
      ) {
        event.preventDefault();
        preloadPromptDialog();
        setIsPromptDialogOpen(true);
        return;
      }

      if (event.key === "Escape" && !isPromptDialogOpen && hasActiveFilters) {
        // Don't clear while a chip editor popover is open — Esc closes it.
        const openPopover = document.querySelector(
          '[data-state="open"][data-radix-popper-content-wrapper], [data-radix-popper-content-wrapper]',
        );
        if (openPopover) return;
        event.preventDefault();
        clearAll();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hasActiveFilters, isPromptDialogOpen, preloadPromptDialog, clearAll]);

  const coverage = results.coverage;
  const coverageCaption =
    results.source === "screen" && coverage
      ? [
          `Showing ${results.coins.length} of ${coverage.matched} matched`,
          `${coverage.scanned} scanned`,
          ...Object.entries(coverage.missingByMetricId).map(
            ([metricId, count]) =>
              `${count} missing ${metricId.replaceAll("_", " ")}`,
          ),
        ].join(" · ")
      : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center w-full">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                aria-label="Open Smart Search"
                variant="ghost"
                size="sm"
                className={cn(
                  "group h-6.5 px-2 gap-1.5 rounded-lg bg-accent hover:bg-accent/90 border border-border hover:ring-1 ring-primary/30 relative",
                  hasActiveFilters &&
                    "ring-1 ring-blue-500/50 dark:ring-blue-400",
                )}
                onPointerEnter={preloadPromptDialog}
                onFocus={preloadPromptDialog}
                onTouchStart={preloadPromptDialog}
                onClick={() => {
                  preloadPromptDialog();
                  setIsPromptDialogOpen(true);
                }}
              >
                <IconSparkles className="size-3 fill-primary/70" />
                <span>Smart Search</span>
                {hasActiveFilters ? (
                  <span className="absolute -top-1 -right-1 size-2 bg-blue-500 rounded-full" />
                ) : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="flex items-center gap-2 p-1 pl-2 rounded-md text-xs"
            >
              <span>Open by pressing</span>
              <Kbd>S</Kbd>
            </TooltipContent>
          </Tooltip>

          <ScreenerFilterChips />

          {hasActiveFilters ? (
            <span className="text-[10px] uppercase text-muted-foreground ml-1">
              press <Kbd className="font-bold w-8">esc</Kbd> to clear
            </span>
          ) : null}
        </div>
      </div>

      {coverageCaption ? (
        <p className="w-full text-[11px] text-muted-foreground tabular-nums">
          {coverageCaption}
        </p>
      ) : null}

      {shouldLoadPromptDialog ? (
        <LazyScreenerSmartPromptDialog
          open={isPromptDialogOpen}
          onOpenChange={setIsPromptDialogOpen}
        />
      ) : null}
    </div>
  );
}
