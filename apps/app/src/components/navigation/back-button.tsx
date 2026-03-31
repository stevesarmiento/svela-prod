import React from 'react';
import { Button } from "@v1/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { IconXmark } from "symbols-react";
import type { SelectionState } from './bottom-nav-context';
import { BackgroundPattern } from './background-pattern';

interface BackButtonProps {
  onExitSelection: () => void;
  selectionState: SelectionState;
}

export const BackButton = React.memo(({ onExitSelection, selectionState }: BackButtonProps) => {
  const handleExitSelection = () => {
    // Clear all selections first
    selectionState.onSelectAll(false);
    // Then exit selection mode
    onExitSelection();
  };

  return (
    <div className="relative rounded-[20px] bg-white/95 backdrop-blur-md border border-gray-200/50 dark:bg-zinc-900 dark:border-transparent overflow-hidden px-2 py-2 hover:bg-gray-50/80 dark:hover:bg-zinc-800/80 transition-all duration-200 cursor-pointer
                   shadow-[0_4px_8px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)]
                   dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
      
      {/* React 19: Optimized shared background pattern */}
      <BackgroundPattern />
      
      <div className="relative z-10 flex items-center">
        <Button 
          variant="ghost" 
          size="icon" 
          className="hover:bg-transparent p-0" 
          onClick={handleExitSelection}
          aria-label="Exit selection mode"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <IconXmark className="h-3 w-3 fill-gray-600 hover:fill-gray-900 dark:fill-white/70 dark:hover:fill-white" />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={25}
              className="dark flex items-center text-xs p-0 border-none bg-zinc-900/95 shadow-sm"
            >
              <kbd className="rounded-sm bg-gray-100 dark:bg-border px-1.5 py-0.5 text-xs font-berkeley-mono text-gray-700 dark:text-white">
                ESC
              </kbd>
            </TooltipContent>
          </Tooltip>
        </Button>
      </div>
    </div>
  );
});

BackButton.displayName = 'BackButton';