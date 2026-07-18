import React from 'react';
import { Button } from "@v1/ui/button";
import { Checkbox } from "@v1/ui/checkbox";
import { Spinner } from "@v1/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import type { SelectionState } from './bottom-nav-context';
import { IconTrash } from 'symbols-react';
import { IconAnalyze } from '@/components/icon-analyze';
import { MAX_ANALYZE_TOKENS } from '@/lib/analyze-constants';

interface SelectionContentProps {
  selectionState: SelectionState;
}

function AnalyzeButton({ selectionState }: SelectionContentProps) {
  if (!selectionState.onAnalyzeSelected) return null;

  const count =
    selectionState.analyzeSelectedCount ?? selectionState.selectedCoins.size;
  const overLimit = count > MAX_ANALYZE_TOKENS;

  const button = (
    <Button
      onClick={selectionState.onAnalyzeSelected}
      disabled={count === 0 || overLimit || selectionState.isRemoving}
      variant="secondary"
      size="sm"
      className="rounded-[10px] text-xs h-7 px-2 !pr-3"
    >
      <div className="flex items-center gap-1">
        <IconAnalyze className="h-3 w-3 fill-current" />
        Analyze
      </div>
    </Button>
  );

  if (!overLimit) return button;

  return (
    <Tooltip delayDuration={300}>
      {/* span wrapper: Radix tooltips don't fire on disabled buttons */}
      <TooltipTrigger asChild>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focusable wrapper exposes the tooltip for the disabled button to keyboard users */}
        <span tabIndex={0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Select up to {MAX_ANALYZE_TOKENS} tokens to analyze
      </TooltipContent>
    </Tooltip>
  );
}

export const SelectionContent = React.memo(({ selectionState }: SelectionContentProps) => {
  return (
    <div className="flex items-center justify-between w-full px-2 h-full">
      <div className="flex items-center gap-3">
        <Checkbox
          className="border-white/20"
          checked={selectionState.selectedCoins.size === selectionState.totalCoins && selectionState.totalCoins > 0}
          onCheckedChange={selectionState.onSelectAll}
        />
        <span className="text-xs font-medium font-berkeley-mono text-white">
          {selectionState.selectedCoins.size} of {selectionState.totalCoins} selected
        </span>
      </div>
      <div className="flex items-center gap-2">
        <AnalyzeButton selectionState={selectionState} />
        <Button
          onClick={selectionState.onRemoveSelected}
          disabled={selectionState.selectedCoins.size === 0 || selectionState.isRemoving}
          variant="destructive"
          size="sm"
          className="rounded-[10px] text-xs h-7 px-2 !pr-3"
        >
          {selectionState.isRemoving ? (
            <>
              <Spinner size={14} className="mr-1" />
              Removing...
            </>
          ) : (
            <div className="flex items-center gap-1">
              <IconTrash className="h-3 w-3 fill-white" />
              Remove
              {/* ({selectionState.selectedCoins.size}) */}
            </div>
          )}
        </Button>
      </div>
    </div>
  );
});

SelectionContent.displayName = 'SelectionContent';
