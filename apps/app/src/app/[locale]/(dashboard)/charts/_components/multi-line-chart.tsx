'use client'

import { useMemo } from 'react'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis,
  CartesianGrid,
  Legend
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent,
  ChartConfig
} from "@v1/ui/chart"
import type { CoinMarketData } from '@/types/coins'
import { useWatchlist } from "./watchlist-context"
import { Skeleton } from "@v1/ui/skeleton"

interface MultiPriceChartProps {
  coins: CoinMarketData[]
}

interface ChartDataPoint {
    time: number;
    [key: string]: number;
  }

export function MultiPriceChart({ coins }: MultiPriceChartProps) {
 // const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const { isLoading } = useWatchlist()
  
  const chartConfig = useMemo((): ChartConfig => {
    return coins.reduce((acc, coin) => ({
      ...acc,
      [coin.id.toString()]: {
        theme: {
          light: getRandomColor(),
          dark: getRandomColor()
        },
        label: coin.name
      }
    }), {})
  }, [coins])

  const chartData = useMemo(() => {
    if (!coins.length) return []

    const timePoints = new Set<number>()
    const priceMap: Record<string, Record<number, number>> = {}

    // Collect all timestamps and organize prices by coin
    coins.forEach(coin => {
      if (coin.historical?.data?.quotes) {
        coin.historical.data.quotes.forEach(quote => {
          const timestamp = new Date(quote.timestamp).getTime()
          timePoints.add(timestamp)
          
          if (!priceMap[coin.id]) {
            priceMap[coin.id] = {}
          }
          
          const initialPrice = quote.quote?.USD?.price ?? 0
          const coinId = coin.id.toString()
          if (!priceMap[coinId]) priceMap[coinId] = {}
          priceMap[coinId][timestamp] = initialPrice
        })
      }
    })

    // Convert to array and sort timestamps
    const sortedTimePoints = Array.from(timePoints).sort()

    // Create data points with percentage changes
    return sortedTimePoints.map(time => {
      const dataPoint: ChartDataPoint = { time }
      
      coins.forEach(coin => {
        const coinId = coin.id.toString()
        const initialPrice = priceMap[coinId]?.[sortedTimePoints[0]] || coin.quote.USD.price
        const currentPrice = priceMap[coinId]?.[time] || coin.quote.USD.price
        dataPoint[coinId] = ((currentPrice - initialPrice) / initialPrice) * 100
      })

      return dataPoint
    })
  }, [coins])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!coins.length) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <LineChart 
            data={chartData}
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            // onMouseMove={(e) => {
            //   setActiveIndex(e.activeTooltipIndex ?? null)
            // }}
            // onMouseLeave={() => {
            //   setActiveIndex(null)
            // }}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="hsl(var(--border))"
              vertical={false}
              opacity={0.5}
            />
            <XAxis 
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(time) => {
                const date = new Date(time)
                return date.toLocaleDateString(undefined, { 
                  month: 'short', 
                  day: 'numeric' 
                })
              }}
              scale="time"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              hide={true}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => `${value.toFixed(2)}%`}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                return (
                  <ChartTooltipContent
                    active={active}
                    payload={payload}
                    labelFormatter={() => {
                      if (!payload?.[0]) return ''
                      const date = new Date(payload[0].payload.time).toLocaleString(undefined, {
                        dateStyle: 'medium'
                      })
                      return <span className="text-muted-foreground text-xs">{date}</span>
                    }}
                    formatter={(value, name) => {
                        const coin = coins.find(c => c.id.toString() === name)
                        return [
                            <span key="value" className="font-semibold text-foreground">
                                {(value as number).toFixed(2)}%
                            </span>,
                            <div key="name" className="flex items-center gap-2">
                                <div 
                                className="w-2 h-2 rounded-full"
                                style={{ 
                                    backgroundColor: chartConfig[name]?.theme?.light || 'currentColor'
                                }} 
                                />
                                <span>{coin?.name || name}</span>
                          </div>
                        ]
                      }}
                    className="text-sm font-mono border-none shadow-none bg-background/5 backdrop-blur-xl p-3"
                  />
                )
              }}
            />
            <Legend 
              content={({ payload }) => (
                <div className="flex flex-wrap gap-4 mt-4">
                  {payload?.map((entry) => {
                    const coin = coins.find(c => c.id.toString() === entry.dataKey)
                    return (
                        <div key={String(entry.dataKey)} className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3" 
                          style={{ backgroundColor: entry.color }}
                        />
                        <span>{coin?.name || entry.value}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            />
            {coins.map((coin) => (
              <Line
                key={coin.id}
                type="monotone"
                dataKey={coin.id.toString()}
                name={coin.name}
                dot={false}
                strokeWidth={2}
                stroke={chartConfig[coin.id.toString()].theme.light}
                activeDot={{
                  r: 4,
                  strokeWidth: 2
                }}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function getRandomColor() {
  const hue = Math.floor(Math.random() * 360)
  return `hsl(${hue}, 70%, 50%)`
}