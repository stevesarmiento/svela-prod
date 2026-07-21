"use client";

import { SEQUENTIAL_SHORTCUTS } from "@/lib/keyboard-shortcuts";
import { DURATION_UI_S, bottomNavChromeMotionStyle } from "@/lib/motion-tokens";
import { cn } from "@v1/ui/cn";
import dynamicImport from "next/dynamic";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BackButton } from "./back-button";
import { MENU_ITEMS } from "./bottom-nav-constants";
import {
  useCommandContext,
  useNavigationMode,
  useOverlayState,
  useSelectionMode,
} from "./bottom-nav-context";
import {
  useCommandHandler,
  useKeyboardShortcuts,
  useSequentialShortcuts,
} from "./bottom-nav-hooks";
import { CommandSearch } from "./command-search";

import type { CommandContext, SelectionState } from "./bottom-nav-context";

// Lazy-mounted so `motion` (and the dock's animation graph) stays out of
// every dashboard route's first-load JS. The dock is fixed-position chrome;
// a same-size placeholder for the brief load gap avoids layout shift.
const NavigationDock = dynamicImport(
  () => import("./navigation-dock").then((module) => module.NavigationDock),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="h-[56px] w-[56px] rounded-[20px] bg-white/95 border border-gray-200/50 dark:bg-zinc-800/80 dark:border-transparent"
      />
    ),
  },
);

const actionEntranceClassName =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-[var(--motion-nav-duration)] motion-safe:ease-[var(--motion-nav-ease-out)] motion-reduce:animate-none";

const layerTransitionClassName =
  "transition-opacity duration-[var(--motion-nav-duration)] ease-[var(--motion-nav-ease-out)] motion-reduce:transition-none";

// Keep exiting content mounted slightly longer than the fade so it can tween out.
const EXIT_RETAIN_MS = DURATION_UI_S * 1000 + 50;

/**
 * Holds on to the last non-null selection state briefly after selection mode
 * exits, so the selection UI can fade out instead of unmounting instantly.
 */
function useRetainedSelection(selectionState: SelectionState | null) {
  const [retained, setRetained] = useState<SelectionState | null>(
    selectionState,
  );

  useEffect(() => {
    if (selectionState) {
      setRetained(selectionState);
      return;
    }
    const timer = setTimeout(() => setRetained(null), EXIT_RETAIN_MS);
    return () => clearTimeout(timer);
  }, [selectionState]);

  return selectionState ?? retained;
}

function SequenceIndicator({ activeSequence }: { activeSequence: string }) {
  const targets = useMemo(() => {
    const continuations =
      SEQUENTIAL_SHORTCUTS[activeSequence as keyof typeof SEQUENTIAL_SHORTCUTS];
    if (!continuations) return [];
    return Object.entries(continuations).map(([key, route]) => ({
      key,
      label:
        MENU_ITEMS.find((item) => item.href === route)?.title ??
        (route as string),
    }));
  }, [activeSequence]);

  if (targets.length === 0) return null;

  return (
    <div
      role="status"
      className={cn(
        "absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap",
        "flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/95 px-3 py-1.5 text-xs text-zinc-400 shadow-lg backdrop-blur-md",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-[var(--motion-nav-duration)] motion-reduce:animate-none",
      )}
    >
      <kbd className="rounded-md bg-zinc-700 px-1.5 py-0.5 font-berkeley-mono text-zinc-200 uppercase">
        {activeSequence}
      </kbd>
      <span className="text-zinc-500">then</span>
      {targets.map((target) => (
        <span key={target.key} className="flex items-center gap-1">
          <kbd className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-berkeley-mono text-zinc-300 uppercase">
            {target.key}
          </kbd>
          <span>{target.label}</span>
        </span>
      ))}
    </div>
  );
}

export function BottomNav() {
  const { mode, setNavigationMode } = useNavigationMode();
  const { selectionState } = useSelectionMode();
  const { isCommandOpen, setIsCommandOpen } = useOverlayState();
  const { commandContext, setCommandContext } = useCommandContext();

  // Handle opening command search from navigation items
  const handleOpenCommandSearch = useCallback(
    (context: CommandContext | null) => {
      setCommandContext(context);
      setIsCommandOpen(true);
    },
    [setIsCommandOpen, setCommandContext],
  );

  // Sequence shortcut targeting the route we're already on (e.g. `g w` while
  // on /watchlists): run the tab's secondary action, same as re-clicking it.
  const handleRouteReactivated = useCallback(
    (route: string) => {
      if (route === "/watchlists") {
        handleOpenCommandSearch("charts");
      }
    },
    [handleOpenCommandSearch],
  );

  const { activeSequence } = useSequentialShortcuts(handleRouteReactivated);
  useKeyboardShortcuts(mode, setNavigationMode, setIsCommandOpen);
  const handleCommandSelect = useCommandHandler();

  // Retained past exit so selection UI can fade out instead of snapping away.
  const retainedSelection = useRetainedSelection(selectionState);

  // Reset context when closing
  const handleCloseCommand = useCallback(
    (open: boolean) => {
      setIsCommandOpen(open);
      if (!open) {
        setCommandContext(null);
      }
    },
    [setIsCommandOpen, setCommandContext],
  );

  return (
    <nav
      aria-label="Primary"
      className="dark pointer-events-none fixed bottom-[max(2rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))] left-0 right-0 z-[9999] flex justify-center px-4"
      data-bottom-nav="true"
    >
      <div
        className="pointer-events-auto relative flex max-w-full shrink-0 flex-nowrap items-center gap-2"
        style={bottomNavChromeMotionStyle()}
      >
        {activeSequence ? (
          <SequenceIndicator activeSequence={activeSequence} />
        ) : null}

        {/* Navigation Dock — duration/ease from motion-tokens (injected CSS vars on this row) */}
        <div
          className={cn(
            "shrink-0",
            layerTransitionClassName,
            isCommandOpen && mode === "navigation"
              ? "pointer-events-none hidden opacity-0"
              : "opacity-100",
          )}
          aria-hidden={isCommandOpen && mode === "navigation"}
        >
          <NavigationDock
            mode={mode}
            selectionState={retainedSelection}
            onOpenCommandSearch={handleOpenCommandSearch}
          />
        </div>

        {/* Action Slot — both layers share one grid cell and cross-fade on mode change */}
        <div className="relative grid shrink-0 grid-cols-1 grid-rows-1 place-items-center">
          <div
            className={cn(
              "col-start-1 row-start-1",
              layerTransitionClassName,
              mode === "navigation"
                ? "opacity-100"
                : "pointer-events-none opacity-0",
            )}
            aria-hidden={mode !== "navigation"}
          >
            <CommandSearch
              isOpen={isCommandOpen}
              setIsOpen={handleCloseCommand}
              onCommandSelect={handleCommandSelect}
              context={commandContext ?? undefined}
            />
          </div>

          {retainedSelection ? (
            <div
              className={cn(
                "col-start-1 row-start-1",
                layerTransitionClassName,
                actionEntranceClassName,
                mode === "selection"
                  ? "opacity-100"
                  : "pointer-events-none opacity-0",
              )}
              aria-hidden={mode !== "selection"}
            >
              <BackButton
                onExitSelection={setNavigationMode}
                selectionState={retainedSelection}
              />
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
