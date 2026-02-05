import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { SEQUENTIAL_SHORTCUTS } from '@/lib/keyboard-shortcuts';

interface KeyboardIndicatorProps {
  activeSequence: string | null;
}

export const KeyboardIndicator = React.memo(({ activeSequence }: KeyboardIndicatorProps) => {
  const shouldReduceMotion = useReducedMotion()

  const getNextKeys = (sequence: string) => {
    const shortcuts = SEQUENTIAL_SHORTCUTS[sequence as keyof typeof SEQUENTIAL_SHORTCUTS];
    if (!shortcuts) return [];
    
    return Object.entries(shortcuts).map(([key, route]) => {
      // Convert route to readable action name
      const action = route.replace('/', '').replace(/^\w/, c => c.toUpperCase());
      return { key, action };
    });
  };

  return (
    <AnimatePresence>
      {activeSequence && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, y: 20, scale: 0.95 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
          className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-[200]"
        >
          <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-3 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-zinc-400">Pressed:</span>
              <kbd className="px-2 py-1 bg-zinc-800 text-white rounded text-xs font-diatype-mono">
                {activeSequence}
              </kbd>
            </div>
            
            <div className="grid grid-cols-2 gap-1">
              {getNextKeys(activeSequence).map(({ key, action }) => (
                <div key={key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800/50">
                  <kbd className="px-1.5 py-0.5 bg-zinc-700 text-white rounded text-xs font-diatype-mono min-w-[20px] text-center">
                    {key}
                  </kbd>
                  <span className="text-xs text-zinc-300">{action}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

KeyboardIndicator.displayName = 'KeyboardIndicator';