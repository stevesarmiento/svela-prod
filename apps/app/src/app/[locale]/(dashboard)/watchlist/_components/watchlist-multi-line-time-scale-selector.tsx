'use client'

import { cn } from "@v1/ui/cn"

export interface WatchlistMultiLineTimeScaleSelectorProps {
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void
}

const SCALES = [
  { value: "1d", label: "1D" }, // 24h change
  { value: "7d", label: "1W" }, // 7d change
  { value: "max", label: "1Y" }, // Longest available
]

export function WatchlistMultiLineTimeScaleSelector({
  activeTimeScale,
  setActiveTimeScale,
}: WatchlistMultiLineTimeScaleSelectorProps) {
  return (
    <div className="flex gap-1 rounded-[14px] border border-zinc-800/10 bg-zinc-950/5 p-1 backdrop-blur-xl dark:border-zinc-800/30 dark:bg-zinc-950/10">
      {SCALES.map((scale) => (
        <button
          key={scale.value}
          onClick={() => setActiveTimeScale(scale.value)}
          className={cn(
            "rounded-lg px-2 py-1 text-xs",
            activeTimeScale === scale.value
              ? "border border-zinc-800/20 bg-zinc-950/50 text-white shadow-md shadow-zinc-950/10 dark:border-zinc-800/50 dark:bg-zinc-800/50 dark:shadow-zinc-950/50"
              : "bg-transparent text-muted-foreground hover:bg-muted/80",
          )}
          type="button"
        >
          {scale.label}
        </button>
      ))}
    </div>
  )
}
