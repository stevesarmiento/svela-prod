import React from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { NavigationItems } from './navigation-items';
import { SelectionContent } from './selection-content';
import type { SelectionState } from './bottom-nav-context';

type CommandContext = 'overview' | 'watchlist' | 'charts' | 'wallet' | 'settings' | null;

interface NavigationDockProps {
  mode: 'navigation' | 'selection';
  selectionState: SelectionState | null;
  isCommandOpen: boolean;
  onOpenCommandSearch?: (context: CommandContext) => void;
}

export const NavigationDock = React.memo(({ 
  mode, 
  selectionState, 
  isCommandOpen,
  onOpenCommandSearch
}: NavigationDockProps) => {
  const dockClassName = React.useMemo(() => {
    return `relative rounded-[20px] overflow-hidden p-1 h-[56px] w-auto flex items-center justify-center
           shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
           dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]
           ${mode === 'selection' 
             ? 'bg-red-500/10 border border-red-200 dark:border-red-800/50' 
             : 'bg-zinc-900'
           } ${isCommandOpen && mode === 'navigation' ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`;
  }, [mode, isCommandOpen]);

  return (
    <AnimatePresence mode="popLayout">
      <motion.div 
        className={dockClassName}
        layout
        transition={{
          type: "spring",
          stiffness: 280,
          damping: 18,
          mass: 0.3,
        }}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5 z-0"
          style={{
            backgroundImage: `
              radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
              radial-gradient(circle at 75% 75%, white 1px, transparent 1px)
            `,
            backgroundSize: "24px 24px",
          }}
        />
        
        <div className="relative z-10 flex items-center gap-1 p-1 w-auto">
          {mode === 'navigation' && (
            <motion.div
              key="navigation"
              layoutId="navigation"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-auto"
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 18,
                mass: 0.3,
              }}
            >
              <NavigationItems onOpenCommandSearch={onOpenCommandSearch || (() => {})} />
            </motion.div>
          )}
          
          {mode === 'selection' && selectionState && (
            <motion.div
              key="selection"
              layoutId="navigation"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 18,
                mass: 0.3,
              }}
              className="w-[320px] flex items-center justify-center"
            >
              <SelectionContent selectionState={selectionState} />
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

NavigationDock.displayName = 'NavigationDock';