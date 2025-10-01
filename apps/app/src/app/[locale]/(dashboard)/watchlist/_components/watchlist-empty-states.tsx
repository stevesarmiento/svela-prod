'use client'

import { Button } from "@v1/ui/button"

interface WatchlistEmptyStateProps {
  type: 'no-coins' | 'no-filtered-coins';
  onClearFilters?: () => void;
}

export function WatchlistEmptyState({ type, onClearFilters }: WatchlistEmptyStateProps) {
  if (type === 'no-coins') {
    return (
      <div className="py-6 border border-dashed border-border rounded-lg">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="text-center">
            <h3 className="font-medium">No coins in watchlist</h3>
            <p className="text-sm text-muted-foreground">Add coins to track their performance</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 border border-dashed border-border rounded-lg">
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="text-center">
          <h3 className="font-medium">No coins match your filters</h3>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search or filter criteria
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onClearFilters}
            className="mt-2"
          >
            Clear all filters
          </Button>
        </div>
      </div>
    </div>
  );
}
