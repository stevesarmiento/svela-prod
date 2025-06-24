import React from 'react';
import { Button } from "@v1/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { IconXmark } from "symbols-react";
import type { SelectionState } from './bottom-nav-context';

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
    <div className="relative rounded-[20px] bg-zinc-900 overflow-hidden px-2 py-2 hover:bg-zinc-800/80 transition-all duration-200 cursor-pointer
                   shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
                   dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
      
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
              <IconXmark className="h-3 w-3 fill-white/70 hover:fill-white" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={25} className="flex items-center text-xs p-0 border-none bg-none shadow-none">
              <kbd className="rounded-sm bg-border px-1.5 py-0.5 text-xs font-mono">
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