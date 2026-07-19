import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { NavigationItems } from './navigation-items';
import { SelectionContent } from './selection-content';
import type { CommandContext, SelectionState } from './bottom-nav-context';
import { uiEnterExitTransition, uiLayoutTransition } from '@/lib/motion-tokens';

interface NavigationDockProps {
  mode: 'navigation' | 'selection';
  selectionState: SelectionState | null;
  onOpenCommandSearch?: (context: CommandContext | null) => void;
}

const NavigationDockComponent = ({
  mode,
  selectionState,
  onOpenCommandSearch,
}: NavigationDockProps) => {
  const shouldReduceMotion = useReducedMotion()

  // Visibility when the command palette is open is handled by the BottomNav wrapper (opacity + pointer-events).
  const dockClassName = React.useMemo(() => {
    return `relative rounded-[20px] overflow-hidden p-1 h-[56px] w-auto flex items-center justify-center
           shadow-[0_3px_8px_oklch(0_0_0_/_0.1),0_2px_4px_oklch(0_0_0_/_0.06)]
           dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_30px_oklch(0.2978_0.0083_317.72_/_0.9),0_4px_16px_oklch(0_0_0_/_0.4)]
           transition-colors duration-200
           ${mode === 'selection'
             ? 'bg-zinc-800'
             : 'bg-white/95 border border-gray-200/50 dark:bg-zinc-800/80 backdrop-blur-md dark:border-transparent'
           }`;
  }, [mode]);

  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        className={dockClassName}
        layout={!shouldReduceMotion}
        transition={uiLayoutTransition(shouldReduceMotion)}
      >
        <div className="relative z-10 flex items-center gap-1 p-1 w-auto">
          {mode === 'navigation' && (
            <motion.div
              key="navigation"
              layoutId={shouldReduceMotion ? undefined : "navigation"}
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
              className="w-auto"
              transition={uiEnterExitTransition(shouldReduceMotion)}
            >
              <NavigationItems onOpenCommandSearch={onOpenCommandSearch || (() => {})} />
            </motion.div>
          )}

          {mode === 'selection' && selectionState && (
            <motion.div
              key="selection"
              layoutId={shouldReduceMotion ? undefined : "navigation"}
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
              transition={uiEnterExitTransition(shouldReduceMotion)}
              className="w-[400px] flex items-center justify-center"
            >
              <SelectionContent selectionState={selectionState} />
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const NavigationDock = React.memo(NavigationDockComponent, areNavigationDockPropsEqual);

NavigationDock.displayName = 'NavigationDock';

function areNavigationDockPropsEqual(
  prevProps: NavigationDockProps,
  nextProps: NavigationDockProps,
): boolean {
  return (
    prevProps.mode === nextProps.mode &&
    prevProps.selectionState?.selectedCoins === nextProps.selectionState?.selectedCoins &&
    prevProps.selectionState?.totalCoins === nextProps.selectionState?.totalCoins &&
    prevProps.selectionState?.isRemoving === nextProps.selectionState?.isRemoving &&
    prevProps.selectionState?.analyzeSelectedCount === nextProps.selectionState?.analyzeSelectedCount &&
    Boolean(prevProps.selectionState?.onAnalyzeSelected) === Boolean(nextProps.selectionState?.onAnalyzeSelected)
  );
}
