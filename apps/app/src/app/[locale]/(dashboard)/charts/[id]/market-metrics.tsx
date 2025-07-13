import { cn } from "@v1/ui/cn"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { Fragment } from "react"
import { IconLaurelLeading, IconLaurelTrailing } from "symbols-react"

interface MarketMetricsProps {
  data: {
    // CoinGecko format
    current_price: number | null
    total_volume: number | null
    market_cap: number | null
    price_change_percentage_24h: number | null
    market_cap_rank: number | null
    circulating_supply: number | null
    max_supply: number | null
    symbol: string
  }
}

export function MarketMetrics({ data }: MarketMetricsProps) {
  // Debug logging for market metrics data
  console.log('📊 MarketMetrics received data:', {
    raw_data: data,
    data_keys: Object.keys(data),
    current_price: data.current_price,
    total_volume: data.total_volume,
    market_cap: data.market_cap,
    price_change_percentage_24h: data.price_change_percentage_24h,
    market_cap_rank: data.market_cap_rank,
    circulating_supply: data.circulating_supply,
    max_supply: data.max_supply,
    symbol: data.symbol
  })
  
  console.log('📊 MarketMetrics data types:', {
    current_price_type: typeof data.current_price,
    total_volume_type: typeof data.total_volume,
    market_cap_type: typeof data.market_cap,
    price_change_24h_type: typeof data.price_change_percentage_24h,
    market_cap_rank_type: typeof data.market_cap_rank
  })

  const metrics: { label: string; value: string; className?: string; }[] = [
    { 
      label: 'Market Cap', 
      value: data.market_cap ? `$${formatLargeNumber(data.market_cap)}` : 'N/A',
    },
    { 
      label: '24h Volume', 
      value: data.total_volume ? `$${formatLargeNumber(data.total_volume)}` : 'N/A',
    },
    { 
      label: '24h Change', 
      value: data.price_change_percentage_24h ? `${data.price_change_percentage_24h.toFixed(2)}%` : 'N/A',
      className: data.price_change_percentage_24h && data.price_change_percentage_24h > 0 ? 'text-emerald-500' : 'text-rose-500',
    },
    { 
      label: 'Circulating Supply', 
      value: data.circulating_supply ? `${data.circulating_supply.toLocaleString()}` : 'N/A',
    },
    { 
      label: 'Max Supply', 
      value: data.max_supply ? `${data.max_supply.toLocaleString()}` : 'Unlimited',
    },
  ]

  // Log the calculated metrics before rendering
  console.log('📊 Calculated metrics for display:', metrics.map(metric => ({
    label: metric.label,
    value: metric.value,
    className: metric.className
  })))

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
            <span className="text-2xl font-mono text-white">{data.market_cap_rank || 'N/A'}</span>
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