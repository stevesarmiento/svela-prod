import type { TooltipCoinData } from "./multi-line-lightweight.types"

export interface TooltipContentProps {
  coinData: TooltipCoinData[]
  timestamp: number
}

export function TooltipContent({ coinData, timestamp }: TooltipContentProps) {
  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <div className="px-4 py-3">
        <div className="mb-3 text-[11px] font-medium text-gray-600 dark:text-zinc-400">
          {new Date(timestamp).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
          })}
        </div>
        <div className="mb-3 h-[1px] w-full scale-125 bg-gray-300 dark:bg-zinc-700/50" />
        <div className="flex flex-col gap-2">
          {coinData.map((coin) => (
            <div key={coin.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-1 rounded-full" style={{ backgroundColor: coin.color }} />
                <span className="max-w-[80px] truncate text-[11px] text-gray-600 dark:text-zinc-400">
                  {coin.symbol.toUpperCase()}{" "}
                  <span className="text-gray-500 dark:text-zinc-500">{coin.name}</span>
                </span>
              </div>
              <span className="font-berkeley-mono text-[11px] font-bold text-gray-900 dark:text-white">
                {coin.value > 0 ? "+" : ""}
                {coin.value.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
