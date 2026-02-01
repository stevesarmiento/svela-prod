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

type CommandContext = 'overview' | 'watchlist' | 'charts' | 'portfolio' | null;

export function BottomNav() {
  // React 19: Use selective context hooks for better performance
  const { mode, setNavigationMode } = useNavigationMode();
  const { selectionState } = useSelectionMode();
  const { isCommandOpen, setIsCommandOpen } = useOverlayState();
  const { commandContext, setCommandContext } = useCommandContext();
  const shouldReduceMotion = useReducedMotion();
  
  // Initialize sequential shortcuts (still needed for functionality)
  useSequentialShortcuts();
  
  // Custom hooks for cleaner logic with React 19 performance improvements
  useKeyboardShortcuts(mode, setNavigationMode, setIsCommandOpen);
  const handleCommandSelect = useCommandHandler();

  // Handle opening command search from navigation items
  const handleOpenCommandSearch = useCallback((context: CommandContext) => {
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
    <div className="fixed z-[9999] bottom-8 left-0 right-0" data-bottom-nav="true">
      <div className="max-w-fit mx-auto flex items-center gap-2 relative">
        {/* Navigation Dock */}
        <AnimatePresence mode="popLayout">
          <motion.div
            animate={{ 
              opacity: isCommandOpen && mode === 'navigation' ? 0 : 1,
              scale: isCommandOpen && mode === 'navigation' ? 0.8 : 1,
              pointerEvents: isCommandOpen && mode === 'navigation' ? 'none' : 'auto'
            }}
            transition={shouldReduceMotion ? { duration: 0 } : {
              type: "spring",
              stiffness: 280,
              damping: 18,
              mass: 0.3,
            }}
           className={`${isCommandOpen ? 'sr-only' : ''}`}
          >
            <NavigationDock
              mode={mode}
              selectionState={selectionState}
              isCommandOpen={isCommandOpen}
              onOpenCommandSearch={handleOpenCommandSearch}
            />
          </motion.div>
        </AnimatePresence>

        {/* Command Search */}
        <AnimatePresence mode="popLayout">
          {mode === 'navigation' && (
            <motion.div
              key="command-search"
              layoutId={shouldReduceMotion ? undefined : "action-button"}
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                pointerEvents: isCommandOpen ? 'auto' : 'none'
              }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
              transition={shouldReduceMotion ? { duration: 0 } : {
                type: "spring",
                stiffness: 280,
                damping: 18,
                mass: 0.3,
              }}
            >
              <CommandSearch
                isOpen={isCommandOpen}
                setIsOpen={handleCloseCommand}
                onCommandSelect={handleCommandSelect}
                context={commandContext}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Back Button - Only show in selection mode */}
        <AnimatePresence mode="popLayout">
          {mode === 'selection' && selectionState && (
            <motion.div
              key="back-button"
              layoutId={shouldReduceMotion ? undefined : "action-button"}
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
              transition={shouldReduceMotion ? { duration: 0 } : {
                type: "spring",
                stiffness: 280,
                damping: 18,
                mass: 0.3,
              }}
            >
              <BackButton 
                onExitSelection={setNavigationMode} 
                selectionState={selectionState}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}