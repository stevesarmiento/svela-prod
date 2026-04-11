'use client'

import { Button } from "@v1/ui/button"
import { cn } from "@v1/ui/cn"

const SHOWCASE_CARDS = [
  { name: 'Layer 1s', color: 'bg-blue-700 border-blue-600' },
  { name: 'Memecoins', color: 'bg-yellow-700 border-yellow-600' },
  { name: 'DeFi', color: 'bg-rose-700 border-rose-600' },
] as const

interface WatchlistEmptyStateProps {
  type: 'no-coins' | 'no-filtered-coins';
  onClearFilters?: () => void;
}

export function WatchlistEmptyState({ type, onClearFilters }: WatchlistEmptyStateProps) {
  if (type === 'no-coins') {
    return (
      <div className="py-6 border border-dashed border-border rounded-lg">
        <div className="flex flex-col items-center justify-center gap-4">
          {/* Color showcase cards */}
          <div className="flex items-center gap-2">
            {SHOWCASE_CARDS.map((card) => (
              <div
                key={card.name}
                className={cn(
                  'rounded-lg border px-3 py-2 text-[11px] font-medium text-white/80 backdrop-blur-md shadow-sm',
                  card.color,
                )}
              >
                {card.name}
              </div>
            ))}
          </div>
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
