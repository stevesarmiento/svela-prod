import { cn } from "@v1/ui/cn"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { Fragment } from "react"

interface MarketMetricsProps {
  data: {
    quote: {
      USD: {
        price: number
        volume_24h: number
        market_cap: number
        percent_change_24h: number
      }
    }
    cmc_rank: number
    circulating_supply: number
    max_supply: number | null
    symbol: string
  }
}

export function MarketMetrics({ data }: MarketMetricsProps) {
  const metrics: { label: string; value: string; className?: string; }[] = [
    { 
      label: 'Market Cap', 
      value: `$${formatLargeNumber(data.quote.USD.market_cap)}`,
    },
    { 
      label: '24h Volume', 
      value: `$${formatLargeNumber(data.quote.USD.volume_24h)}`,
    },
    { 
      label: '24h Change', 
      value: `${data.quote.USD.percent_change_24h.toFixed(2)}%`,
      className: data.quote.USD.percent_change_24h > 0 ? 'text-emerald-500' : 'text-rose-500',
    },
    { 
      label: 'Global Rank', 
      value: `#${data.cmc_rank}`,
    },
    { 
      label: 'Circulating Supply', 
      value: `${(data.circulating_supply.toLocaleString())}`,
    },
    { 
      label: 'Max Supply', 
      value: data.max_supply ? `${data.max_supply.toLocaleString()}` : 'Unlimited',
    },
  ]

  return (
    <div className="grid grid-cols-11 items-center">
      {metrics.map((metric, index) => (
        <Fragment key={metric.label}>
          <div 
            className={cn(
              "flex flex-col items-center py-4 col-span-1",
            )}
          >
            {/* Icon and Label */}
            <div className="flex items-center gap-2 text-center">
              <span className="text-[11px] text-muted-foreground font-medium">
                {metric.label}
              </span>
            </div>
            
            {/* Value - Centered */}
            <div className={cn(
              "text-md font-mono text-center",
              metric.className || "text-foreground"
            )}>
              {metric.value}
            </div>
          </div>
          
          {/* Separator - only between items, not after the last one */}
          {index < metrics.length - 1 && (
            <div className="flex justify-center col-span-1">
              <div className="h-[77px] w-[1px] bg-gradient-to-b from-transparent via-foreground/20 to-transparent" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}