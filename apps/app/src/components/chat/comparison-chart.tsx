'use client'

import React, { useMemo } from 'react'
import type { Time } from 'lightweight-charts'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { generatePastelColors } from '@/lib/chart-colors'
import { useOptimizedChart } from '@/hooks/use-optimized-chart'
import { loadLightweightCharts } from '@/lib/load-lightweight-charts'

interface ComparisonChartProps {
  coins: Array<{
    coingeckoId: string;
    name: string;
    symbol: string;
    currentPrice: number;
    priceChangePercentage24h: number;
    marketCap: number;
    totalVolume: number;
    marketCapRank: number;
    image?: string;
    historical?: {
      timeframe: string;
      prices: Array<{
        timestamp: number;
        price: number;
      }>;
      volumes?: Array<{
        timestamp: number;
        volume: number;
      }>;
    };
  }>;
  timeframe: string;
  chartType?: string;
}

interface PriceDataPoint {
  time: Time
  value: number
}

interface CoinSeries {
  id: string
  name: string
  symbol: string
  color: string
  data: PriceDataPoint[]
  latestValue: number
}

export function ComparisonChart({ coins, timeframe }: ComparisonChartProps) {

  const coinSeriesData = useMemo((): CoinSeries[] => {
    if (!coins.length) return []

    const colors = generatePastelColors(coins.length)
    
    return coins.map((coin, index) => {
      const data: PriceDataPoint[] = []
      
      if (coin.historical?.prices && coin.historical.prices.length > 0) {
        const prices = coin.historical.prices
        
        // Sort prices by timestamp to ensure proper ordering and filter out invalid data
        const sortedPrices = [...prices]
          .filter(price => 
            price && 
            typeof price.timestamp === 'number' && 
            typeof price.price === 'number' && 
            !Number.isNaN(price.timestamp) && 
            !Number.isNaN(price.price) && 
            price.price > 0
          )
          .sort((a, b) => a.timestamp - b.timestamp)
        
        if (sortedPrices.length > 0) {
          // Use the first price as baseline for percentage calculation
          const initialPrice = sortedPrices[0]?.price
          
          if (initialPrice && initialPrice > 0 && !Number.isNaN(initialPrice)) {
            sortedPrices.forEach((pricePoint) => {
              const currentPrice = pricePoint.price
              if (currentPrice && currentPrice > 0 && !Number.isNaN(currentPrice)) {
                const percentChange = ((currentPrice - initialPrice) / initialPrice) * 100
                // Additional validation for the calculated percentage
                if (!Number.isNaN(percentChange) && Number.isFinite(percentChange)) {
                  data.push({
                    time: (pricePoint.timestamp / 1000) as Time,
                    value: percentChange,
                  })
                }
              }
            })
          }
        }
      }

      const latestValue = data.length > 0 ? data[data.length - 1]?.value || 0 : 0

      return {
        id: coin.coingeckoId,
        name: coin.name,
        symbol: coin.symbol,
        color: colors[index] || `hsl(${Math.random() * 360}, 40%, 75%)`,
        data: data.filter(item => 
          item &&
          typeof item.time === "number" &&
          typeof item.value === "number" &&
          !Number.isNaN(item.value) &&
          Number.
          isFinite(item.value)
        ),
        latestValue
      }
    }).filter(series => series.data.length > 0)
  }, [coins])

  // ✅ OPTIMIZED: Using useOptimizedChart hook instead of manual useEffect chart creation
  // Eliminates code duplication and provides consistent chart behavior
  const { chartContainerRef } = useOptimizedChart({
    height: 200,
    showGrid: false,
    showTimeScale: false,
    showCrosshair: true,
    onChartReady: (chart) => {
      if (coinSeriesData.length > 0) {
        void (async () => {
          const { LineSeries, LastPriceAnimationMode } =
            await loadLightweightCharts()

          // Create line series for each coin
          coinSeriesData.forEach((coinSeries) => {
            const lineSeries = chart.addSeries(LineSeries, {
              lineWidth: 2,
              lastValueVisible: false,
              visible: true,
              priceLineVisible: false,
              color: coinSeries.color,
              lastPriceAnimation: LastPriceAnimationMode.Continuous,
              priceFormat: {
                type: "custom",
                formatter: (price: number) => `${price > 0 ? '+' : ''}${price.toFixed(2)}%`,
              },
            })
            
            lineSeries.setData(coinSeries.data)
          })

          chart.timeScale().fitContent()
        })()
      }
    }
  })

  const coinNames = coins.map(coin => coin.symbol.toUpperCase()).join(' vs ')

  return (
    <Card className="w-full bg-white/80 border-gray-200/50 dark:bg-zinc-950/30 dark:border-zinc-800/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">{coinNames} Comparison</h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400">Performance over {timeframe}</p>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-2">
          {coinSeriesData.map((series) => (
            <div key={series.id} className="flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: series.color }}
              />
              <span className="text-xs text-gray-700 dark:text-zinc-300">{series.symbol.toUpperCase()}</span>
              <span className="text-xs font-diatype-mono text-gray-900 dark:text-white">
                {series.latestValue > 0 ? '+' : ''}{series.latestValue.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div ref={chartContainerRef} className="w-full h-[200px]" />
      </CardContent>
    </Card>
  )
} 
