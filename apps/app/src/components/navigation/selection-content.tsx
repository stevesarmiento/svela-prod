import React from 'react';
import { Button } from "@v1/ui/button";
import { Checkbox } from "@v1/ui/checkbox";
import { Spinner } from "@v1/ui/spinner";
import type { SelectionState } from './bottom-nav-context';
import { IconTrash } from 'symbols-react';

interface SelectionContentProps {
  selectionState: SelectionState;
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