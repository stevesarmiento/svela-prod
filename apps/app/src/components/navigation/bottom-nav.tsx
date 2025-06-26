"use client";

import React, { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBottomNav } from "./bottom-nav-context";
import { useKeyboardShortcuts, useCommandHandler, useSequentialShortcuts } from "./bottom-nav-hooks";
import { NavigationDock } from "./navigation-dock";
import { BackButton } from "./back-button";
import { CommandSearch } from "./command-search";

type CommandContext = 'overview' | 'watchlist' | 'charts' | 'settings' | null;

export function BottomNav() {
  const { 
    mode, 
    selectionState, 
    setNavigationMode, 
    isCommandOpen, 
    setIsCommandOpen 
  } = useBottomNav();
  
  const [commandContext, setCommandContext] = useState<CommandContext>(null);
  
  // Initialize sequential shortcuts (still needed for functionality)
  useSequentialShortcuts();
  
  // Custom hooks for cleaner logic
  useKeyboardShortcuts(mode, setNavigationMode, setIsCommandOpen);
  const handleCommandSelect = useCommandHandler();

  // Handle opening command search from navigation items
  const handleOpenCommandSearch = useCallback((context: CommandContext) => {
    setCommandContext(context);
    setIsCommandOpen(true);
  }, [setIsCommandOpen]);

  // Reset context when closing
  const handleCloseCommand = useCallback((open: boolean) => {
    setIsCommandOpen(open);
    if (!open) {
      setCommandContext(null);
    }
  }, [setIsCommandOpen]);

  return (
    <div className={`fixed z-50 bottom-8 transition-all duration-200 ${
      isCommandOpen && mode === 'navigation'
        ? 'left-[50%] transform -translate-x-1/2'
        : 'left-[50%] transform -translate-x-1/2'
    }`}>
      <div className="flex items-center gap-2">
        {/* Hide navigation dock when command is open */}
        <motion.div
          animate={{ 
            opacity: isCommandOpen && mode === 'navigation' ? 0 : 1,
            scale: isCommandOpen && mode === 'navigation' ? 0.8 : 1,
            pointerEvents: isCommandOpen && mode === 'navigation' ? 'none' : 'auto'
          }}
          transition={{
            type: "spring",
            stiffness: 280,
            damping: 18,
            mass: 0.3,
          }}
        >
          <NavigationDock
            mode={mode}
            selectionState={selectionState}
            isCommandOpen={isCommandOpen}
            onOpenCommandSearch={handleOpenCommandSearch}
          />
        </motion.div>

        {/* Command Search or Back Button */}
        <AnimatePresence mode="popLayout">
          {mode === 'navigation' && (
            <motion.div
              key="command-search"
              layoutId="action-button"
              initial={{ opacity: 0, scale: 1, x: -20 }}
              animate={{ 
                opacity: 1, 
                scale: 1, 
                x: isCommandOpen ? -120 : 0  // Shift left when expanded to center
              }}
              exit={{ opacity: 0, scale: 1, x: -20 }}
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 18,
                mass: 0.3,
              }}            >
              <CommandSearch
                isOpen={isCommandOpen}
                setIsOpen={handleCloseCommand}
                onCommandSelect={handleCommandSelect}
                context={commandContext}
              />
            </motion.div>
          )}
          
          {mode === 'selection' && selectionState && (
            <motion.div
              key="back-button"
              layoutId="action-button"
              initial={{ opacity: 0, scale: 0.9, x: -20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: -20 }}
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 18,
                mass: 0.3,
              }}            >
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