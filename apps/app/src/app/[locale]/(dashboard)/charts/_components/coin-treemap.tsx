'use client'

import { useMemo, memo, ReactElement } from 'react'
import { Treemap } from 'recharts'
import { Props as ContentProps } from 'recharts/types/component/DefaultLegendContent'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { ChartContainer, ChartTooltip } from "@v1/ui/chart"
import { Skeleton } from "@v1/ui/skeleton"
import type { CoinMarketData } from '@/types/coins'
import { formatLargeNumber } from "@v1/ui/format-numbers";
import { cn } from '@v1/ui/cn'

interface CoinTreemapProps {
  coins: CoinMarketData[]
}

interface TreemapData {
  name: string
  symbol: string
  size: number
  value: number
  percentChange: number
  volume24h: number
}

interface CustomContentProps {
  x: number
  y: number
  width: number
  height: number
  name: string
  percentChange: number
}

function TreemapSkeleton() {
  return (
    <Card className="col-span-1">
    <CardHeader>
      <CardTitle className="font-medium font-diatype-mono">Market Overview</CardTitle>
    </CardHeader>
    <CardContent>
        <div className="space-y-3 p-1">
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-[180px]" />
            <Skeleton className="h-[180px]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-[160px]" />
            <Skeleton className="h-[160px]" />
            <Skeleton className="h-[160px]" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const CustomContent = memo(function CustomContent({
  x,
  y,
  width,
  height,
  name,
  percentChange,
}: CustomContentProps) {
  // Return null if we don't have valid dimensions or percentChange
  if (!width || !height || percentChange === undefined || percentChange === null) return null

  // Only render if the cell is large enough to be visible
  const shouldRenderText = width > 50 && height > 30
  
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        className={cn(
          'transition-colors duration-200',
          percentChange > 0 
            ? 'fill-green-500/40 hover:fill-green-500/60' 
            : 'fill-red-500/40 hover:fill-red-500/60'
        )}
        stroke="hsl(var(--border))"
        strokeWidth={1}
      />
      {shouldRenderText && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          fill="white"
          fontSize={10}
          stroke="none"
          className="select-none pointer-events-none font-diatype-mono"
        >
          <tspan x={x + width / 2} dy="-0.5em" fontWeight="bold">
            {name}
          </tspan>
          <tspan x={x + width / 2} dy="1.3em" className="opacity-50">
            {percentChange > 0 ? '+' : ''}
            {percentChange.toFixed(2)}%
          </tspan>
        </text>
      )}
    </g>
  )
})

export function CoinTreemap({ coins }: CoinTreemapProps) {
  const data = useMemo(() => {
    // Return null if no coins or empty array
    if (!coins?.length) return null
    
    const validCoins = coins
      .filter(coin => 
        // Ensure we have all required data before including a coin
        coin.quote.USD.market_cap > 0 && 
        coin.quote.USD.percent_change_24h !== null &&
        coin.quote.USD.percent_change_24h !== undefined &&
        coin.quote.USD.volume_24h > 0
      )
      .map((coin): TreemapData => ({
        name: coin.name,
        symbol: coin.symbol,
        size: coin.quote.USD.market_cap,
        value: coin.quote.USD.market_cap,
        percentChange: coin.quote.USD.percent_change_24h,
        volume24h: coin.quote.USD.volume_24h
      }))

    // Return null if no valid coins after filtering
    return validCoins.length ? validCoins : null
  }, [coins])

  if (!data) return <TreemapSkeleton />

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="font-medium font-diatype-mono">Market Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ChartContainer config={{}}>
            <Treemap
              data={data}
              dataKey="size"
              aspectRatio={1}
              stroke="hsl(var(--border))"
              content={
                ((props: ContentProps) => 
                  <CustomContent {...(props as CustomContentProps)} />
                ) as unknown as ReactElement
              }
            >
              <ChartTooltip
                content={({ active, payload }) => {
                  // Add debug logging
                  console.log('Tooltip payload:', payload?.[0]?.payload)

                  if (!active || !payload?.[0]?.payload) return null

                  const data = payload[0].payload as TreemapData
                  
                  // Create an array of formatted values
                  const formattedValues = [
                    {
                      label: 'Name',
                      value: `${data.name} (${data.symbol})`
                    },
                    {
                      label: 'Market Cap',
                      value: `$${formatLargeNumber(data.value)}`
                    },
                    {
                      label: 'Volume 24h',
                      value: `$${formatLargeNumber(data.volume24h)}`
                    },
                    {
                      label: 'Change',
                      value: `${data.percentChange > 0 ? '+' : ''}${data.percentChange.toFixed(2)}%`,
                      className: data.percentChange > 0 ? 'text-emerald-500' : 'text-rose-500'
                    }
                  ]

                  return (
                    <div className="text-sm font-diatype-mono border-none shadow-none bg-background backdrop-blur-xl p-3 rounded-lg">
                      {formattedValues.map(({ label, value, className }) => (
                        <div key={label} className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">{label}:</span>
                          <span className={className}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )
                }}
              />
            </Treemap>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}