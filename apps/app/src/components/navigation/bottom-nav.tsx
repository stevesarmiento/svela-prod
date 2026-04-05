"use client";

import React, { useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
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
import { uiEnterExitTransition } from "@/lib/motion-tokens";

import type { CommandContext } from "./bottom-nav-context";

export function BottomNav() {
  // React 19: Use selective context hooks for better performance
  const { mode, setNavigationMode } = useNavigationMode();
  const { selectionState } = useSelectionMode();
  const { isCommandOpen, setIsCommandOpen } = useOverlayState();
  const { commandContext, setCommandContext } = useCommandContext();
  const shouldReduceMotion = useReducedMotion();

  const navTransition = uiEnterExitTransition(shouldReduceMotion);
  
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
      <div className="pointer-events-auto relative flex max-w-full shrink-0 flex-nowrap items-center gap-2">
        {/* Navigation Dock */}
        <motion.div
          animate={{
            // Opacity only: scale shrinks the painted dock inside a full-width flex cell and reads as off-center.
            opacity: isCommandOpen && mode === "navigation" ? 0 : 1,
            pointerEvents: isCommandOpen && mode === "navigation" ? "none" : "auto",
          }}
          transition={navTransition}
          className={`${isCommandOpen ? "sr-only" : "shrink-0"}`}
        >
          <NavigationDock
            mode={mode}
            selectionState={selectionState}
            isCommandOpen={isCommandOpen}
            onOpenCommandSearch={handleOpenCommandSearch}
          />
        </motion.div>

        {/* Action Slot */}
        {/* sync: avoid popLayout reflow on sibling dock when the action slot updates */}
        <AnimatePresence mode="sync">
          {mode === "selection" && selectionState ? (
            <motion.div
              className="shrink-0"
              key="back-button"
              layoutId={shouldReduceMotion ? undefined : "action-button"}
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
              transition={navTransition}
            >
              <BackButton 
                onExitSelection={setNavigationMode} 
                selectionState={selectionState}
              />
            </motion.div>
          ) : mode === "navigation" ? (
            <motion.div
              className="shrink-0"
              key="command-search"
              layoutId={shouldReduceMotion ? undefined : "action-button"}
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{
                opacity: 1,
                scale: 1,
                pointerEvents: isCommandOpen ? "auto" : "none",
              }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
              transition={navTransition}
            >
              <CommandSearch
                isOpen={isCommandOpen}
                setIsOpen={handleCloseCommand}
                onCommandSelect={handleCommandSelect}
                context={commandContext}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}