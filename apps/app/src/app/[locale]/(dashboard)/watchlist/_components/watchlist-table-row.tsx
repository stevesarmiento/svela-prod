'use client'

import { flexRender, type Row } from '@tanstack/react-table'
import Link from "next/link"
import { cn } from "@v1/ui/cn"
import type { CoinMarketData } from '@/types/coins'

interface WatchlistTableRowProps {
  row: Row<CoinMarketData>;
  selectedCoins: Set<string>;
  watchlistGroup: string | null;
  onCoinSelect: (coinId: string, selected: boolean) => void;
}

export function WatchlistTableRow({ 
  row, 
  selectedCoins, 
  watchlistGroup, 
  onCoinSelect
}: WatchlistTableRowProps) {
  const isSelected = selectedCoins.has(row.original.id.toString());
  const hasAnySelections = selectedCoins.size > 0;
  
  return (
    <Link 
      key={row.id}
      href={watchlistGroup ? `/charts/${row.original.id}?wg=${watchlistGroup}` : `/charts/${row.original.id}`}
      className={cn(
        "grid gap-4 px-4 py-2.5 border-b last:border-b-0 hover:bg-primary/[0.02] transition-opacity duration-200 cursor-pointer",
        hasAnySelections ? (isSelected ? "opacity-100" : "opacity-40") : "opacity-100"
      )}
      style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr 0.5fr' }}
    >
      {/* First cell - merged select + token with specific hover */}
      <div 
        className="flex items-center"
        onClick={(e) => {
          e.preventDefault(); // Always prevent navigation for first cell
          e.stopPropagation();

          // Let the checkbox handle its own toggling (avoid double-toggle).
          const target = e.target as HTMLElement
          if (target.closest('[data-watchlist-row-checkbox="true"]')) return
          
          // Toggle checkbox selection when clicking anywhere in first cell
          const isCurrentlySelected = selectedCoins.has(row.original.id.toString());
          onCoinSelect(row.original.id.toString(), !isCurrentlySelected);
        }}
      >
        {(() => {
          const firstCell = row.getVisibleCells()[0];
          return firstCell && flexRender(firstCell.column.columnDef.cell, firstCell.getContext());
        })()}
      </div>
      
      {/* Rest of the cells (skip the hidden token-sort column and removed market cap) */}
      {row.getVisibleCells().slice(2, -1).map(cell => ( // Exclude last cell (actions)
        <div 
          key={cell.id}
          className="flex items-center justify-start"
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
      
      {/* Actions cell - prevent navigation */}
      <div 
        className="flex items-center justify-end"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {(() => {
          const lastCell = row.getVisibleCells()[row.getVisibleCells().length - 1];
          return lastCell && flexRender(lastCell.column.columnDef.cell, lastCell.getContext());
        })()}
      </div>
    </Link>
  );
}
