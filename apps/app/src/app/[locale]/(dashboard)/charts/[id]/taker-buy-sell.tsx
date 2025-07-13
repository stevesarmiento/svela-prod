'use client'

import React, { useMemo, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Skeleton } from "@v1/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@v1/ui/tooltip"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { useTakerBuySell } from '@/hooks/use-taker-buy-sell'
import { TrendingUp, TrendingDown, Info } from 'lucide-react'
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'
import { coinGeckoIdToSymbolFallback } from '@/lib/coingecko-to-symbol'

interface TakerBuySellProps {
  coinId: string
  range?: string
  className?: string
}

export function TakerBuySell({
  coinId,
  range = '24h',
}: TakerBuySellProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<ApexCharts | null>(null)
  
  // Convert CoinGecko ID to symbol for Coinglass API
  const symbol = coinGeckoIdToSymbolFallback(coinId)
  
  const { data, isLoading, error } = useTakerBuySell({
    symbol,
    range,
  })

  // Generate consistent colors using chart-colors.ts
  const colors = useMemo(() => {
    const pastelColors = generatePastelColors(3)
    return {
      buy: addOpacityToColor(pastelColors[0] || '', 0.8),
      sell: addOpacityToColor(pastelColors[1] || '', 0.8),
      neutral: addOpacityToColor(pastelColors[2] || '', 0.8),
    }
  }, [])

  const chartData = useMemo(() => {
    if (!data?.success) return null

    const { overall, exchanges } = data.data
    
    // Sort exchanges by volume and take top 8
    const topExchanges = exchanges
      .sort((a, b) => b.totalVolumeUsd - a.totalVolumeUsd)
      .slice(0, 8)

    // Calculate volume-weighted average for median line
    const totalVolume = topExchanges.reduce((sum, ex) => sum + ex.totalVolumeUsd, 0)
    const weightedAverage = topExchanges.reduce((sum, ex) => 
      sum + (ex.buyRatio * ex.totalVolumeUsd), 0) / totalVolume

    // Helper function to determine color based on buy ratio
    function getBuyRatioColor(buyRatio: number): string {
      if (buyRatio < 48) return addOpacityToColor(colors.sell, 0.3) // More translucent
      if (buyRatio > 52) return addOpacityToColor(colors.buy, 0.3) // More translucent
      return addOpacityToColor(colors.neutral, 0.3) // More translucent
    }

    // Transform data for box plot
    const series = [{
      data: topExchanges.map((exchange) => {
        const buyRatio = exchange.buyRatio
        const volumeWeight = exchange.totalVolumeUsd / totalVolume
        
        // Create box plot data: [min, q1, median, q3, max]
        const spread = volumeWeight * 100 // Volume determines box width
        const center = buyRatio
        
        return {
          x: exchange.exchange,
          y: [
            Math.max(0, center - spread), // min
            Math.max(0, center - spread/2), // q1
            center, // median (buy ratio)
            Math.min(100, center + spread/2), // q3
            Math.min(100, center + spread) // max
          ],
          fillColor: getBuyRatioColor(buyRatio),
        }
      })
    }]

    const options = {
      chart: {
        type: 'boxPlot' as const,
        height: 400,
        toolbar: {
          show: false
        },
        background: 'transparent'
      },
      plotOptions: {
        bar: {
          horizontal: true,
          barHeight: '30%'
        },
        boxPlot: {
          colors: {
            upper: colors.buy, // Solid border
            lower: colors.sell // Solid border
          }
        }
      },
      stroke: {
        colors: ['#f5f5f530'], // Brighter extension lines
        width: 1
      },
      xaxis: {
        min: 0,
        max: 100,
        title: {
          text: '',
        },
        labels: {
          show: false,
        },
        axisBorder: {
          show: false
        },
        axisTicks: {
          show: false
        },
        // Keep background zones for sentiment using chart colors
        plotBands: [
          {
            from: 0,
            to: 48,
            color: addOpacityToColor(colors.sell, 0.1),
          },
          {
            from: 48,
            to: 52,
            color: addOpacityToColor(colors.neutral, 0.1),
          },
          {
            from: 52,
            to: 100,
            color: addOpacityToColor(colors.buy, 0.1),
          }
        ]
      },
      yaxis: {
        labels: {
          style: {
            colors: '#ffffff50'
          }
        }
      },
      grid: {
        borderColor: '#ffffff10',
        strokeDashArray: 10,
        xaxis: {
          lines: {
            show: false
          }
        },
        yaxis: {
          lines: {
            show: true
          }
        }
      },
      tooltip: {
        theme: 'dark',
        custom: function({ dataPointIndex }: { dataPointIndex: number }) {
          const exchange = topExchanges[dataPointIndex]
          if (!exchange) return ''
          // No date available, so just show exchange name at top
          return `
            <div class="overflow-hidden text-[11px] text-white rounded-xl w-[200px] shadow-2xl pointer-events-none backdrop-blur-xl bg-zinc-900/95 border border-zinc-700/50 transition-all duration-100 ease-in-out">
              <div class="px-4 py-3">
                <div class="mb-3 text-[11px] text-zinc-400 font-medium">${exchange.exchange}</div>
                <div class="w-full h-[1px] mb-3 bg-zinc-700/50 scale-125"></div>
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] text-emerald-400">Buy</span>
                    <span class="text-[11px] font-mono text-emerald-400 font-bold">${exchange.buyRatio.toFixed(1)}% ($${formatLargeNumber(exchange.buyVolumeUsd)})</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] text-rose-400">Sell</span>
                    <span class="text-[11px] font-mono text-rose-400 font-bold">${exchange.sellRatio.toFixed(1)}% ($${formatLargeNumber(exchange.sellVolumeUsd)})</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] text-zinc-400">Total Volume</span>
                    <span class="text-[11px] font-mono text-white font-bold">$${formatLargeNumber(exchange.totalVolumeUsd)}</span>
                  </div>
                </div>
              </div>
            </div>
          `
        }
      },
      legend: {
        show: false
      }
    }

    return { series, options, overall, weightedAverage, topExchanges }
  }, [data, colors])

  // Initialize and update chart
  useEffect(() => {
    if (!chartRef.current || !chartData) return

    // Dynamically import ApexCharts only on client side
    import('apexcharts').then((ApexChartsModule) => {
      const ApexCharts = ApexChartsModule.default

      // Destroy existing chart if it exists
      if (chartInstance.current) {
        chartInstance.current.destroy()
      }

      // Create new chart
      chartInstance.current = new ApexCharts(chartRef.current, {
        ...chartData.options,
        series: chartData.series
      })

      chartInstance.current.render()
    })

    // Cleanup function
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy()
        chartInstance.current = null
      }
    }
  }, [chartData])

  if (isLoading) {
    return (
      <Card className="border-none bg-transparent">
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-48" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error || !data?.success || !chartData) {
    return (
      <Card className="border-none bg-transparent">
        <CardHeader>
          <CardTitle className="text-destructive">Failed to load buy/sell data for {symbol}</CardTitle>
          <div className="text-xs text-muted-foreground">
            CoinGecko ID &quot;{coinId}&quot; → Symbol &quot;{symbol}&quot;
          </div>
        </CardHeader>
      </Card>
    )
  }

  const { overall, weightedAverage } = chartData
  const isBuyPressure = overall.buyRatio > overall.sellRatio

  return (
    <Card className="border-none bg-transparent">
      <CardContent className="space-y-6">
        
        {/* Data source indicator */}
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground">
            {symbol} data via Coinglass
          </div>
        </div>
        
        {/* Overall Market Summary */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/20">
          <div className="flex items-center gap-3">
            {isBuyPressure ? (
              <TrendingUp className="w-5 h-5" style={{ color: colors.buy }} />
            ) : (
              <TrendingDown className="w-5 h-5" style={{ color: colors.sell }} />
            )}
            <div>
              <div className="text-sm font-medium flex items-center gap-2">
                Market Sentiment: <span style={{ color: isBuyPressure ? colors.buy : colors.sell }}>
                  {isBuyPressure ? 'Bullish' : 'Bearish'}
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="space-y-2">
                      <div className="text-xs font-medium">Buy/Sell Pressure Zones:</div>
                      <div className="flex items-center gap-2 text-xs">
                        <div 
                          className="w-2 h-2 border rounded" 
                          style={{ 
                            backgroundColor: addOpacityToColor(colors.sell, 0.2), 
                            borderColor: colors.sell 
                          }}
                        ></div>
                        <span>Sell Pressure (&lt;48%)</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div 
                          className="w-2 h-2 border rounded" 
                          style={{ 
                            backgroundColor: addOpacityToColor(colors.neutral, 0.2), 
                            borderColor: colors.neutral 
                          }}
                        ></div>
                        <span>Neutral (48-52%)</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div 
                          className="w-2 h-2 border rounded" 
                          style={{ 
                            backgroundColor: addOpacityToColor(colors.buy, 0.2), 
                            borderColor: colors.buy 
                          }}
                        ></div>
                        <span>Buy Pressure (&gt;52%)</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="text-xs text-muted-foreground">
                Volume-weighted average: {weightedAverage.toFixed(1)}% buy ratio
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">
              {overall.buyRatio.toFixed(1)}% / {overall.sellRatio.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              ${formatLargeNumber(overall.buyVolumeUsd + overall.sellVolumeUsd)} total
            </div>
          </div>
        </div>

        {/* ApexCharts Box Plot */}
        <div className="w-full">
          <div ref={chartRef} />
        </div>
      </CardContent>
    </Card>
  )
}