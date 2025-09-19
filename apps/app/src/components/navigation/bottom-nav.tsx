"use client";

import React, { useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigationMode, useSelectionMode, useOverlayState, useCommandContext, useChatContext } from "./bottom-nav-context";
import { useKeyboardShortcuts, useCommandHandler, useSequentialShortcuts } from "./bottom-nav-hooks";
import { NavigationDock } from "./navigation-dock";
import { BackButton } from "./back-button";
import { CommandSearch } from "./command-search";
import { ChatContainer } from "./chat-container";
import { ChatStateManager } from "../chat/chat-toast";

type CommandContext = 'overview' | 'watchlist' | 'charts' | 'portfolio' | null;

export function BottomNav() {
  // React 19: Use selective context hooks for better performance
  const { mode, setNavigationMode } = useNavigationMode();
  const { selectionState } = useSelectionMode();
  const { isCommandOpen, isChatOpen, setIsCommandOpen } = useOverlayState();
  const { commandContext, setCommandContext } = useCommandContext();
  const { closeChat } = useChatContext();
  
  // Register closeChat callback with ChatStateManager
  useEffect(() => {
    const manager = ChatStateManager.getInstance();
    manager.setInputCloseCallback(closeChat);
  }, [closeChat]);
  
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
    <div className="fixed z-50 bottom-8 left-0 right-0">
      <div className="max-w-fit mx-auto flex items-center gap-2 relative">
        {/* Chat Container - Single expandable container */}
        <AnimatePresence mode="popLayout">
          {mode === 'navigation' && !isCommandOpen && (
            <motion.div
              key="chat-container"
              layoutId="chat-container"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ 
                opacity: 1,
                scale: 1,
              }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <ChatContainer />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Dock */}
        <AnimatePresence mode="popLayout">
          <motion.div
            animate={{ 
              filter: (isCommandOpen || isChatOpen) && mode === 'navigation' ? 'blur(20px)' : 'blur(0px)',
              opacity: (isCommandOpen || isChatOpen) && mode === 'navigation' ? 0 : 1,
              scale: (isCommandOpen || isChatOpen) && mode === 'navigation' ? 0.8 : 1,
              pointerEvents: (isCommandOpen || isChatOpen) && mode === 'navigation' ? 'none' : 'auto'
            }}
            transition={{
              type: "spring",
              stiffness: 280,
              damping: 18,
              mass: 0.3,
            }}
           className={`${isCommandOpen || isChatOpen ? 'sr-only' : ''}`}
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
          {mode === 'navigation' && !isChatOpen && (
            <motion.div
              key="command-search"
              layoutId="action-button"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                pointerEvents: isCommandOpen ? 'auto' : 'none'
              }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
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
              layoutId="action-button"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
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