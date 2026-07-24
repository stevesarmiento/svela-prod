import { cn } from "@v1/ui/cn"

export interface TimeScaleSelectorProps {
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void
}

const SCALES = [
  { value: "1d", label: "1D" }, // 24h (48 hours of hourly data)
  { value: "7d", label: "1W" }, // 7 days
  { value: "30d", label: "1M" }, // 90 days
  { value: "max", label: "1Y" }, // 1 year of data
]

export function TimeScaleSelector({ activeTimeScale, setActiveTimeScale }: TimeScaleSelectorProps) {
  return (
    <div className="flex gap-1 rounded-[12px] border border-gray-200/50 bg-white/95 p-1 backdrop-blur-xl dark:border-zinc-800/30 dark:bg-zinc-950/10">
      {SCALES.map((scale) => (
        <button
          key={scale.value}
          onClick={() => setActiveTimeScale(scale.value)}
          className={cn(
            "rounded-lg px-2 py-1 text-xs",
            activeTimeScale === scale.value
              ? "border border-gray-300 bg-gray-200 text-gray-900 shadow-md shadow-gray-500/20 dark:border-zinc-800/50 dark:bg-zinc-800/50 dark:text-white dark:shadow-zinc-950/50"
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
