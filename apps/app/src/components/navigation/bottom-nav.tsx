"use client";

import React, { useCallback } from "react";
import {
  useNavigationMode,
  useSelectionMode,
  useOverlayState,
  useCommandContext,
} from "./bottom-nav-context";
import { useKeyboardShortcuts, useCommandHandler, useSequentialShortcuts } from "./bottom-nav-hooks";
import { NavigationDock } from "./navigation-dock";
import { BackButton } from "./back-button";
import { CommandSearch } from "./command-search";
import { bottomNavChromeMotionStyle } from "@/lib/motion-tokens";
import { cn } from "@v1/ui/cn";

import type { CommandContext } from "./bottom-nav-context";

const actionEntranceClassName =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-[var(--motion-nav-duration)] motion-safe:ease-[var(--motion-nav-ease-out)] motion-reduce:animate-none";

export function BottomNav() {
  // React 19: Use selective context hooks for better performance
  const { mode, setNavigationMode } = useNavigationMode();
  const { selectionState } = useSelectionMode();
  const { isCommandOpen, setIsCommandOpen } = useOverlayState();
  const { commandContext, setCommandContext } = useCommandContext();
  
  // Initialize sequential shortcuts (still needed for functionality)
  useSequentialShortcuts();
  
  // Custom hooks for cleaner logic with React 19 performance improvements
  useKeyboardShortcuts(mode, setNavigationMode, setIsCommandOpen);
  const handleCommandSelect = useCommandHandler();

  // Handle opening command search from navigation items
  const handleOpenCommandSearch = useCallback((context: CommandContext | null) => {
    setCommandContext(context);
    setIsCommandOpen(true);
  }, [setIsCommandOpen, setCommandContext]);

  // Reset context when closing
  const handleCloseCommand = useCallback((open: boolean) => {
    setIsCommandOpen(open);
    if (!open) {
      setCommandContext(null);
    }
  }, [setIsCommandOpen, setCommandContext]);

  return (
    <div
      className="dark pointer-events-none fixed bottom-8 left-0 right-0 z-[9999] flex justify-center px-4"
      data-bottom-nav="true"
    >
      <div
        className="pointer-events-auto relative flex max-w-full shrink-0 flex-nowrap items-center gap-2"
        style={bottomNavChromeMotionStyle()}
      >
        {/* Navigation Dock — duration/ease from motion-tokens (injected CSS vars on this row) */}
        <div
          className={cn(
            "shrink-0 transition-opacity duration-[var(--motion-nav-duration)] ease-[var(--motion-nav-ease-out)] motion-reduce:transition-none",
            isCommandOpen && mode === "navigation"
              ? "pointer-events-none opacity-0 hidden"
              : "opacity-100",
          )}
          aria-hidden={isCommandOpen && mode === "navigation"}
        >
          <NavigationDock
            mode={mode}
            selectionState={selectionState}
            onOpenCommandSearch={handleOpenCommandSearch}
          />
        </div>

        {/* Action Slot — entrance via tailwindcss-animate; no exit tween without keeping both mounted */}
        {mode === "selection" && selectionState ? (
          <div className={cn("shrink-0", actionEntranceClassName)} key="back-button">
            <BackButton
              onExitSelection={setNavigationMode}
              selectionState={selectionState}
            />
          </div>
        ) : mode === "navigation" ? (
          <div
            className={cn("shrink-0", actionEntranceClassName)}
            key="command-search"
          >
            <CommandSearch
              isOpen={isCommandOpen}
              setIsOpen={handleCloseCommand}
              onCommandSelect={handleCommandSelect}
              context={commandContext}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}