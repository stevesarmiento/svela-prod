'use client'

import { useMemo } from 'react'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis,
  CartesianGrid,
  Cell
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { 
  ChartContainer, 
  ChartTooltip,
  type ChartConfig
} from "@v1/ui/chart"
import type { CoinMarketData } from '@/types/coins'
import { useWatchlist } from "../../watchlist/_components/watchlist-context"
import { Skeleton } from "@v1/ui/skeleton"

interface MultiPriceChartProps {
  coins: CoinMarketData[]
}

interface ChartDataPoint {
    time: number;
    name: string;
    value: number;
    coinId: string;
  }

  function ChartSkeleton() {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-medium font-berkeley-mono">24h Percentage Change</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-[400px] w-full" />
            <div className="flex flex-wrap gap-4">
              {Array.from({ length: 4 }, (_, i) => `legend-${i}`).map((legendKey) => (
                <div key={legendKey} className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

export function MultiPriceChart({ coins }: MultiPriceChartProps) {
 // const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const { isLoading } = useWatchlist()
  
  // Simple chart config for bar chart
  const chartConfig = {
    value: {
      label: "24h Change %",
    },
  } satisfies ChartConfig

  const chartData = useMemo(() => {
    if (!coins.length) return []

    // Create individual data points for bar chart representation
    const dataPoints: ChartDataPoint[] = []
    
    coins.forEach(coin => {
      const changeValue = coin.quote.USD.percent_change_24h || 0
      dataPoints.push({
        time: Date.now(),
        name: coin.symbol.toUpperCase(), // Use symbol for cleaner labels
        value: changeValue,
        coinId: coin.id.toString()
      })
    })

    // Sort by value descending for better visualization
    return dataPoints.sort((a, b) => b.value - a.value)
  }, [coins])

  if (isLoading || !coins.length) {
    return <ChartSkeleton />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-medium font-berkeley-mono">24h Percentage Change</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart 
            data={chartData}
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="hsl(var(--border))"
              vertical={false}
              opacity={0.5}
            />
            <XAxis 
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => `${value.toFixed(1)}%`}
            />
            <ChartTooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const value = payload[0]?.value as number
                const isPositive = value >= 0
                
                return (
                  <div className="rounded-lg border bg-background p-3 shadow-md">
                    <div className="flex items-center gap-2 mb-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ 
                          backgroundColor: isPositive ? '#10b981' : '#ef4444'
                        }} 
                      />
                      <span className="font-semibold text-sm">{label}</span>
                    </div>
                    <div className="text-sm">
                      <span className={`font-berkeley-mono font-semibold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                        {isPositive ? '+' : ''}{value.toFixed(2)}%
                      </span>
                      <span className="text-muted-foreground ml-2">24h change</span>
                    </div>
                  </div>
                )
              }}
            />
            <Bar
              dataKey="value"
              radius={[2, 2, 0, 0]}
            >
              {chartData.map((entry) => (
                <Cell 
                  key={entry.coinId} 
                  fill={entry.value >= 0 ? '#10b981' : '#ef4444'}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}