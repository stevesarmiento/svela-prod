'use client'

import { WatchlistGroupIcon } from "@/components/watchlist-group-icon"
import type { TooltipWatchlistDataRow } from "./watchlist-multi-line.types"

export interface WatchlistMultiLineTooltipContentProps {
  watchlistData: TooltipWatchlistDataRow[]
  timestamp: number
}

export function WatchlistMultiLineTooltipContent({
  watchlistData,
  timestamp,
}: WatchlistMultiLineTooltipContentProps) {
  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <div className="px-4 py-3">
        <div className="mb-3 text-[11px] font-medium text-muted-foreground">
          {/* react-doctor-disable-next-line react-doctor/no-locale-format-in-render -- rendered only into an imperative client-created root from a hover handler; never part of SSR output */}
          {new Date(timestamp).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
          })}
        </div>
        <div className="mb-3 h-[1px] w-full scale-125 bg-border/50" />
        <div className="flex flex-col gap-2">
          {watchlistData.map((watchlist) => (
            <div key={watchlist.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-1 rounded-full" style={{ backgroundColor: watchlist.color }} />
                <WatchlistGroupIcon
                  icon={watchlist.icon}
                  className="h-3 w-3 text-muted-foreground"
                  size={12}
                />
                <span className="max-w-[120px] truncate text-[11px] text-muted-foreground">
                  {watchlist.name}
                </span>
              </div>
              <span className="font-berkeley-mono text-[11px] font-bold text-foreground">
                {watchlist.value === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    {watchlist.value > 0 ? "+" : ""}
                    {watchlist.value.toFixed(2)}%
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
