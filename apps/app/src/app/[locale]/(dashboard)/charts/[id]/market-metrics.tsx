import { cn } from "@v1/ui/cn"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { Fragment } from "react"
import { IconLaurelLeading, IconLaurelTrailing } from "symbols-react"

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
      label: 'Circulating Supply', 
      value: `${(data.circulating_supply.toLocaleString())}`,
    },
    { 
      label: 'Max Supply', 
      value: data.max_supply ? `${data.max_supply.toLocaleString()}` : 'Unlimited',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Global Rank Section */}
      <div className="relative flex items-center justify-center py-4">
        {/* Background separator line */}
        <div className="absolute inset-0 flex items-center">
          <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
        </div>
        
        {/* Rank content */}
        <div className="relative flex items-center gap-3 bg-background px-0 rounded-full">
          <IconLaurelLeading className="w-10 h-10 fill-foreground/20" />
          
          <div className="flex flex-col items-center">
            <span className="text-[11px] uppercase text-muted-foreground font-medium">Rank</span>
            <span className="text-2xl font-mono text-white">{data.cmc_rank}</span>
          </div>
          
          <IconLaurelTrailing className="w-10 h-10 fill-foreground/20" />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-9 items-center">
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
    </div>
  )
}