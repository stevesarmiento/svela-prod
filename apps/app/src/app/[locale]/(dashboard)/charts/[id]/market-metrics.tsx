import { cn } from "@v1/ui/cn"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { memo, useMemo, useDeferredValue } from "react"
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
  isPending?: boolean
}

export const MarketMetrics = memo(function MarketMetrics({ data, isPending }: MarketMetricsProps) {
  // React 19: Defer expensive data processing
  const deferredData = useDeferredValue(data)
  // React 19: Memoized debug logging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 MarketMetrics received data:', {
      raw_data: deferredData,
      data_keys: Object.keys(deferredData),
      current_price: deferredData.current_price,
      total_volume: deferredData.total_volume,
      market_cap: deferredData.market_cap,
      price_change_percentage_24h: deferredData.price_change_percentage_24h,
      market_cap_rank: deferredData.market_cap_rank,
      circulating_supply: deferredData.circulating_supply,
      max_supply: deferredData.max_supply,
      symbol: deferredData.symbol
    })
  }

  // React 19: Memoized metrics calculation using deferred data
  const metrics: { label: string; value: string; className?: string }[] = useMemo(() => {
    const marketCap =
      deferredData.market_cap != null && Number.isFinite(deferredData.market_cap)
        ? `$${formatLargeNumber(deferredData.market_cap)}`
        : "N/A"

    const volume24h =
      deferredData.total_volume != null && Number.isFinite(deferredData.total_volume)
        ? `$${formatLargeNumber(deferredData.total_volume)}`
        : "N/A"

    const change24h =
      deferredData.price_change_percentage_24h != null && Number.isFinite(deferredData.price_change_percentage_24h)
        ? `${deferredData.price_change_percentage_24h.toFixed(2)}%`
        : "N/A"

    const change24hClassName =
      deferredData.price_change_percentage_24h != null && Number.isFinite(deferredData.price_change_percentage_24h)
        ? deferredData.price_change_percentage_24h >= 0
          ? "text-emerald-500"
          : "text-rose-500"
        : "text-muted-foreground"

    const circulatingSupply =
      deferredData.circulating_supply != null && Number.isFinite(deferredData.circulating_supply)
        ? deferredData.circulating_supply.toLocaleString()
        : "N/A"

    const maxSupply =
      deferredData.max_supply != null && Number.isFinite(deferredData.max_supply)
        ? deferredData.max_supply.toLocaleString()
        : "Unlimited"

    return [
      { label: "Market Cap", value: marketCap },
      { label: "24h Volume", value: volume24h },
      { label: "24h Change", value: change24h, className: change24hClassName },
      { label: "Circulating Supply", value: circulatingSupply },
      { label: "Max Supply", value: maxSupply },
    ]
  }, [deferredData])

  // React 19: Memoized development logging
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 Calculated metrics for display:', metrics.map(metric => ({
      label: metric.label,
      value: metric.value,
      className: metric.className
    })))
  }

  // React 19: Show pending states
  const showPending = isPending

  return (
    <div className={cn(
      "space-y-6",
      showPending && "opacity-80 transition-opacity duration-200"
    )}>
      {/* Global Rank Section */}
      <div className="relative flex items-center justify-center py-4">
        {/* Background separator line */}
        <div className="absolute inset-0 flex items-center">
          <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
        </div>
        
        {/* React 19: Enhanced Rank content with pending states */}
        <div className={cn(
          "relative flex items-center gap-3 bg-background px-0 rounded-full",
          showPending && "animate-pulse motion-reduce:animate-none"
        )}>
          <IconLaurelLeading className={cn(
            "w-10 h-10 fill-foreground/20",
            showPending && "opacity-60"
          )} />
          
          <div className="flex flex-col items-center">
            <span className="text-[11px] uppercase text-muted-foreground font-medium">Rank</span>
            <span className={cn(
              "text-2xl font-diatype-mono text-white",
              showPending && "animate-pulse motion-reduce:animate-none"
            )}>
              {deferredData.market_cap_rank || 'N/A'}
            </span>
          </div>
          
          <IconLaurelTrailing className={cn(
            "w-10 h-10 fill-foreground/20",
            showPending && "opacity-60"
          )} />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-9 items-center">
        {metrics.map((metric, index) => (
          <div key={metric.label} className="contents">
            <div 
              className={cn(
                "flex flex-col items-center py-4 col-span-1",
                showPending && "opacity-80"
              )}
            >
              {/* Icon and Label */}
              <div className="flex items-center gap-2 text-center">
                <span className="text-[11px] text-muted-foreground font-medium">
                  {metric.label}
                </span>
              </div>
              
              {/* Value - Centered with pending animation */}
              <div className={cn(
                "text-md font-diatype-mono text-center",
                metric.className || "text-foreground",
                showPending && "animate-pulse motion-reduce:animate-none"
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
          </div>
        ))}
      </div>
    </div>
  )
})