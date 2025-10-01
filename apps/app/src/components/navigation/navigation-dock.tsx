import React from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { NavigationItems } from './navigation-items';
import { SelectionContent } from './selection-content';
import type { SelectionState } from './bottom-nav-context';
import { BackgroundPattern } from './background-pattern';

type CommandContext = 'overview' | 'watchlist' | 'charts' | 'portfolio' | null;

interface NavigationDockProps {
  mode: 'navigation' | 'selection';
  selectionState: SelectionState | null;
  isCommandOpen: boolean;
  onOpenCommandSearch?: (context: CommandContext) => void;
}

const NavigationDockComponent = ({ 
  mode, 
  selectionState, 
  isCommandOpen,
  onOpenCommandSearch
}: NavigationDockProps) => {
  const dockClassName = React.useMemo(() => {
    return `relative rounded-[20px] overflow-hidden p-1 h-[56px] w-auto flex items-center justify-center
           shadow-[0_4px_8px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)]
           dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]
           ${mode === 'selection' 
             ? 'bg-rose-950 border border-red-200 dark:border-red-800/50' 
             : 'bg-white/95 border border-gray-200/50 dark:bg-zinc-900 dark:border-transparent'
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
        {/* React 19: Optimized shared background pattern */}
        <BackgroundPattern />
        
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
};

// React 19: Enhanced memo with custom comparison function
export const NavigationDock = React.memo(NavigationDockComponent, areNavigationDockPropsEqual);

NavigationDock.displayName = 'NavigationDock';

// React 19: Enhanced memo comparison for better performance
function areNavigationDockPropsEqual(
  prevProps: NavigationDockProps, 
  nextProps: NavigationDockProps
): boolean {
  return (
    prevProps.mode === nextProps.mode &&
    prevProps.isCommandOpen === nextProps.isCommandOpen &&
    prevProps.selectionState?.selectedCoins === nextProps.selectionState?.selectedCoins &&
    prevProps.selectionState?.totalCoins === nextProps.selectionState?.totalCoins &&
    prevProps.selectionState?.isRemoving === nextProps.selectionState?.isRemoving
  );
}