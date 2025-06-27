'use client'

import React, { useEffect, useRef, useMemo, useState } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineData,
  Time,
  LastPriceAnimationMode,
  LineSeries,
  ISeriesApi,
} from 'lightweight-charts'
import { Card, CardContent, CardHeader } from "@v1/ui/card"
import { createRoot } from "react-dom/client"
import type { CoinMarketData } from '@/types/coins'
import { useWatchlist } from "../../watchlist/_components/watchlist-context"
import { cn } from "@v1/ui/cn";
import { IconCircleDottedAndCircle, IconXmarkCircleFill, IconPlus } from 'symbols-react'
import { toast } from "@v1/ui/use-toast"
import Link from 'next/link'
import { useBottomNav } from '@/components/navigation/bottom-nav-context'
import { Button } from '@v1/ui/button'
import { Spinner } from "@v1/ui/spinner"
import { generatePastelColors, addOpacityToColor } from '@/lib/chart-colors'

interface OptimisticCoinMarketData extends CoinMarketData {
  isOptimistic?: boolean;
}

interface MultiPriceChartLightweightProps {
  coins: OptimisticCoinMarketData[]
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void
}

interface PriceDataPoint {
  time: Time
  value: number
}

interface TooltipCoinData {
  name: string
  color: string
  value: number
  symbol: string
}

interface CoinSeries {
  id: string
  name: string
  symbol: string
  color: string
  data: PriceDataPoint[]
}

interface LineSeriesData {
  series: ISeriesApi<"Line">
  coinData: CoinSeries
}

const TooltipContent = ({
  coinData,
  timestamp,
}: {
  coinData: TooltipCoinData[]
  timestamp: number
}) => {
  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <div className="px-3 pb-1 pt-2">
        <div className="mb-2 text-xs text-muted-foreground">
          {new Date(timestamp).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
        </div>
        {coinData.map((coin) => (
          <div key={coin.name} className="flex items-center gap-2 py-0.5">
            <div
              className="h-4 w-1 rounded-full"
              style={{ backgroundColor: coin.color }}
            />
            <span className="font-mono text-sm">
              {coin.value > 0 ? '+' : ''}{coin.value.toFixed(2)}%
            </span>
            <span className="text-xs text-muted-foreground">
              {coin.symbol.toUpperCase()}
            </span>
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
              {coin.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function filterValidPriceData(data: PriceDataPoint[]): PriceDataPoint[] {
  return (
    data?.filter(
      (item) =>
        item &&
        typeof item.time === "number" &&
        typeof item.value === "number" &&
        !isNaN(item.value) &&
        isFinite(item.value),
    ) || []
  )
}

const TimeScaleSelector = ({ 
  activeTimeScale, 
  setActiveTimeScale 
}: { 
  activeTimeScale: string
  setActiveTimeScale: (scale: string) => void 
}) => {
  const scales = [
    { value: "7d", label: "1D" },
    { value: "30d", label: "1W" },
    { value: "max", label: "1Y" },
    { value: "2y", label: "2Y" },
  ]

  return (
    <div className="flex gap-1 bg-zinc-900 rounded-[12px] p-1">
      {scales.map((scale) => (
        <button
          key={scale.value}
          onClick={() => setActiveTimeScale(scale.value)}
          className={cn(
            "px-2 py-1 text-xs rounded-lg",
            activeTimeScale === scale.value
              ? "bg-zinc-800/50 border border-zinc-800/50 text-white"
              : "bg-transparent text-muted-foreground hover:bg-muted/80"
          )}
        >
          {scale.label}
        </button>
      ))}
    </div>
  )
}

export function MultiPriceChartLightweight({ 
  coins, 
  activeTimeScale, 
  setActiveTimeScale 
}: MultiPriceChartLightweightProps) {
  const { removeFromWatchlist } = useWatchlist()
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [hoveredCoin, setHoveredCoin] = useState<string | null>(null)
  const [hoveredRemoveId, setHoveredRemoveId] = useState<string | null>(null)
  const lineSeriesMapRef = useRef<Map<string, LineSeriesData>>(new Map())
  
  // Use the bottom nav context to trigger contextual command search
  const { openContextualCommandSearch } = useBottomNav()

  // Filter out optimistic coins for chart rendering (they don't have data yet)
  const coinsWithData = useMemo(() => {
    return coins.filter(coin => !coin.isOptimistic);
  }, [coins]);

  const coinSeriesData = useMemo((): CoinSeries[] => {
    if (!coinsWithData.length) return []

    const colors = generatePastelColors(coinsWithData.length)
    
    console.log('Processing coins:', coinsWithData.length) // Add debugging
    
    return coinsWithData.map((coin, index) => {
      const data: PriceDataPoint[] = []
      
      console.log(`Processing ${coin.symbol}:`, {
        hasHistorical: !!coin.historical?.data?.quotes,
        quotesLength: coin.historical?.data?.quotes?.length || 0,
        currentPrice: coin.quote.USD.price
      })
      
      if (coin.historical?.data?.quotes && coin.historical.data.quotes.length > 0) {
        let quotes = coin.historical.data.quotes
        
        // Sort quotes by timestamp to ensure proper ordering
        quotes = quotes.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        
        // Filter based on activeTimeScale - updated to match API timeframes
        const now = Date.now()
        const timeFilters = {
          '7d': 30 * 24 * 60 * 60 * 1000,     // Last 30 days (1D view with hourly data)
          '30d': 90 * 24 * 60 * 60 * 1000,    // Last 90 days (1W view)
          'max': 365 * 24 * 60 * 60 * 1000,   // Last 365 days (1Y view)
          '2y': 730 * 24 * 60 * 60 * 1000,    // Last 730 days (2Y view)
        }
        
        const timeLimit = timeFilters[activeTimeScale as keyof typeof timeFilters] || Infinity
        
        if (timeLimit !== Infinity) {
          const cutoffTime = now - timeLimit
          quotes = quotes.filter(quote => 
            new Date(quote.timestamp).getTime() >= cutoffTime
          )
        }
        
        console.log(`${coin.symbol}: Total quotes: ${coin.historical.data.quotes.length}, Filtered: ${quotes.length}, Scale: ${activeTimeScale}`)
        
        if (quotes.length > 0) {
          // Use the first quote's price as baseline
          const initialPrice = quotes[0]?.quote?.USD?.price
          
          console.log(`${coin.symbol}: Initial price: ${initialPrice}`)
          
          if (initialPrice && initialPrice > 0) {
            quotes.forEach((quote, idx) => {
              const currentPrice = quote.quote?.USD?.price
              if (currentPrice && currentPrice > 0) {
                const percentChange = ((currentPrice - initialPrice) / initialPrice) * 100
                data.push({
                  time: (new Date(quote.timestamp).getTime() / 1000) as Time,
                  value: percentChange,
                })
                
                if (idx < 3) { // Log first few data points
                  console.log(`${coin.symbol} data point ${idx}:`, {
                    time: quote.timestamp,
                    currentPrice,
                    percentChange: percentChange.toFixed(2)
                  })
                }
              }
            })
          }
        } else {
          console.log(`${coin.symbol}: No quotes after filtering`)
        }
        
        data.sort((a, b) => (a.time as number) - (b.time as number))
      } else {
        console.log(`${coin.symbol}: No historical data available`)
      }

      const validData = filterValidPriceData(data)
      console.log(`${coin.symbol}: Valid data points: ${validData.length}`)

      return {
        id: coin.id.toString(),
        name: coin.name,
        symbol: coin.symbol,
        color: colors[index] || `hsl(${Math.random() * 360}, 40%, 75%)`,
        data: validData,
      }
    }).filter(series => {
      const hasData = series.data.length > 0
      console.log(`${series.symbol}: Included in chart: ${hasData}`)
      return hasData
    })
  }, [coinsWithData, activeTimeScale])

  const latestValues = useMemo(() => {
    return coinSeriesData.map(series => ({
      ...series,
      latestValue: series.data[series.data.length - 1]?.value || 0
    }))
  }, [coinSeriesData])

  useEffect(() => {
    if (!chartContainerRef.current || !coinSeriesData.length) return

    const chart = createChart(chartContainerRef.current, {
      handleScale: true,
      handleScroll: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#ffffff50",
        attributionLogo: false,
      },
      grid: {
        vertLines: { 
          visible: false,
          color: "#e5e7eb0",
          style: LineStyle.Dotted,
        },
        horzLines: { 
          visible: false,
          color: "#f5f5f50",
          style: LineStyle.Dotted,
        },
      },
      rightPriceScale: {
        borderVisible: false,
        autoScale: true,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          labelVisible: true,
          width: 1,
          color: "#d1d5db40",
          visible: true,
          style: LineStyle.Solid,
        },
        horzLine: {
          visible: false,
          labelVisible: false,
        },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
      },
    })

    // Create line series for each coin
    const lineSeriesMap = new Map()
    
    coinSeriesData.forEach((coinSeries) => {
      const lineSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        lastValueVisible: true,
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
      lineSeriesMap.set(coinSeries.id, { series: lineSeries, coinData: coinSeries })
    })

    // Store the map in ref for hover effects
    lineSeriesMapRef.current = lineSeriesMap

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: 400,
        })
      }
    }

    window.addEventListener("resize", handleResize)
    handleResize()

    // Add tooltip
    const tooltipEl = document.createElement("div")
    const tooltipRoot = createRoot(tooltipEl)
    tooltipEl.className = `
      fixed hidden 
      text-xs
      text-foreground
      rounded-xl
      shadow-xl
      pointer-events-none 
      z-30
      backdrop-blur-sm
      bg-background/90
      border border-border
      transition-all duration-100 ease-in-out
    `
    document.body.appendChild(tooltipEl)

    // Subscribe to crosshair move
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        tooltipEl.style.display = "none"
        return
      }

      if (!chartContainerRef.current) return
      const chartRect = chartContainerRef.current.getBoundingClientRect()

      const coinData: TooltipCoinData[] = []
      
      lineSeriesMap.forEach((lineData) => {
        const seriesData = param.seriesData.get(lineData.series) as LineData<Time>
        if (seriesData) {
          coinData.push({
            name: lineData.coinData.name,
            color: lineData.coinData.color,
            value: seriesData.value,
            symbol: lineData.coinData.symbol,
          })
        }
      })

      if (coinData.length === 0) {
        tooltipEl.style.display = "none"
        return
      }

      tooltipEl.style.display = "block"
      tooltipRoot.render(
        <TooltipContent
          coinData={coinData}
          timestamp={Number(param.time) * 1000}
        />
      )

      const tooltipWidth = tooltipEl.offsetWidth
      const tooltipHeight = tooltipEl.offsetHeight

      // Position tooltip
      let left = chartRect.left + param.point.x + 15
      let top = chartRect.top + param.point.y - tooltipHeight / 2

      // Adjust if tooltip goes beyond right edge
      if (left + tooltipWidth > window.innerWidth - 10) {
        left = chartRect.left + param.point.x - tooltipWidth - 15
      }

      // Adjust if tooltip goes beyond bottom edge
      if (top + tooltipHeight > window.innerHeight - 10) {
        top = window.innerHeight - tooltipHeight - 10
      }

      // Adjust if tooltip goes beyond top edge
      if (top < 10) {
        top = 10
      }

      tooltipEl.style.left = `${left}px`
      tooltipEl.style.top = `${top}px`
    })

    return () => {
      window.removeEventListener("resize", handleResize)
      requestAnimationFrame(() => {
        tooltipRoot.unmount()
        document.body.removeChild(tooltipEl)
      })
      chart.remove()
    }
  }, [coinSeriesData])

  // Handle hover effects on chart lines
  useEffect(() => {
    if (!lineSeriesMapRef.current.size) return

    lineSeriesMapRef.current.forEach((lineData, coinId) => {
      const { series, coinData } = lineData
      const isHovered = hoveredCoin === coinId
      const isOtherHovered = hoveredCoin && hoveredCoin !== coinId

      if (isOtherHovered) {
        // Dim this line
        series.applyOptions({
          color: addOpacityToColor(coinData.color, 0.3), // 30% opacity
          lineWidth: 1,
        })
      } else if (isHovered) {
        // Highlight this line
        series.applyOptions({
          color: coinData.color,
          lineWidth: 2,
        })
      } else {
        // Reset to normal
        series.applyOptions({
          color: coinData.color,
          lineWidth: 1,
        })
      }
    })
  }, [hoveredCoin])

  // Always show the main UI structure
  return (
    <div className="grid grid-cols-12 gap-0 rounded-[13px] bg-zinc-950/50 border border-zinc-800/20 overflow-hidden p-1">
      {/* Legend */}
      <div className="flex flex-col col-span-3 p-6 pt-2 space-y-2">   
        <div className="flex flex-row items-center justify-between gap-2 mb-3"> 
          <IconCircleDottedAndCircle className="size-6 fill-primary/40" />
          {/* Add Coin Button - triggers chart contextual command search */}
          <Button
            variant="outline"
            onClick={() => openContextualCommandSearch('charts')}
            className="group w-full border-zinc-800/0 hover:border-zinc-800/80 bg-transparent hover:bg-transparent flex items-center gap-2 justify-between p-3 rounded-lg"
          >
            <span className="text-muted-foreground font-normal text-sm group-hover:text-white">Add to comparison</span>
            <IconPlus className="group-hover:fill-blue-500 group-hover:rotate-90 transition-all duration-200 size-3 fill-muted-foreground" />
          </Button>
        </div> 
        
        <div className="flex flex-col gap-2 space-y-3">
          {/* Show loading coins in legend */}
          {coins.map((coin) => {
            const realCoin = latestValues.find(c => c.id === coin.id.toString());
            
            return (
              <div key={coin.id}>
                {coin.isOptimistic ? (
                  // Loading state in legend
                  <div className="flex items-center gap-2 opacity-50 rounded-lg p-0 -m-2">
                    <div className="w-1 h-9 rounded-full bg-muted animate-pulse" />
                    <div className="flex flex-row items-center gap-2 flex-1 ml-2">
                      <span className="text-xs font-medium">...</span>
                      <span className="text-xs font-mono text-muted-foreground">Loading...</span>
                    </div>
                  </div>
                ) : realCoin ? (
                  // Real coin in legend
                  <Link 
                    href={`/charts/${coin.id}`}
                    className="block"
                  >
                    <div 
                      className={cn(
                        "flex overflow-hidden items-center gap-2 cursor-pointer transition-opacity duration-200 rounded-lg p-0 -m-2 relative group hover:bg-white/10",
                        hoveredCoin && hoveredCoin !== coin.id.toString() ? "opacity-40" : "opacity-100",
                        hoveredCoin === coin.id.toString() ? "bg-white/5" : ""
                      )}
                      style={{ backgroundColor: addOpacityToColor(realCoin.color, 0.05) }}
                      onMouseEnter={() => setHoveredCoin(coin.id.toString())}
                      onMouseLeave={() => setHoveredCoin(null)}
                    >
                      <div 
                        className="w-1 h-9 rounded-full transition-transform duration-200"
                        style={{ backgroundColor: realCoin.color }}
                      />
                      <div className="flex flex-row items-center gap-2 flex-1 ml-2">
                        <span className="text-xs font-medium">{realCoin.symbol.toUpperCase()}</span>
                        <span className="text-xs font-mono text-muted-foreground">{realCoin.name}</span>
                      </div>
                      
                      {/* Remove Icon - appears on hover */}
                      <div 
                        className={cn(
                          "absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded-full hover:bg-red-500/20",
                          hoveredRemoveId === coin.id.toString() ? "bg-red-500/30" : ""
                        )}
                        onMouseEnter={(e) => {
                          e.stopPropagation()
                          setHoveredRemoveId(coin.id.toString())
                        }}
                        onMouseLeave={(e) => {
                          e.stopPropagation()
                          setHoveredRemoveId(null)
                        }}
                        onClick={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          try {
                            await removeFromWatchlist(Number(coin.id))
                            toast({
                              title: "Removed",
                              description: `${coin.name} removed from watchlist`,
                            })
                          } catch {
                            toast({
                              title: "Error", 
                              description: "Failed to remove from watchlist",
                              variant: "destructive",
                            })
                          }
                        }}
                      >
                        <IconXmarkCircleFill 
                          className={cn(
                            "size-4 transition-colors duration-200",
                            hoveredRemoveId === coin.id.toString()
                              ? "fill-red-400" 
                              : "fill-muted-foreground hover:fill-red-400"
                          )}
                        />
                      </div>
                    </div>
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="col-span-9 border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        {/* Chart Content */}
        <div className="p-0 relative">
          <div
            className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-30"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
            }}
          />
          <Card className="border-none bg-transparent">
            <CardHeader className="flex flex-row items-center justify-end">
              <TimeScaleSelector
                activeTimeScale={activeTimeScale}
                setActiveTimeScale={setActiveTimeScale}
              />
            </CardHeader>
            <CardContent className="pl-8">
              <div className="p-0 relative">
                {/* Show loading message if no chart data yet */}
                {coinsWithData.length === 0 && coins.length > 0 ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <div className="text-center">
                      <Spinner size={24} className="mb-2" />
                      <p className="text-sm text-muted-foreground">Loading chart data...</p>
                    </div>
                  </div>
                ) : coinsWithData.length === 0 ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">No coins to display</p>
                    </div>
                  </div>
                ) : (
                  <div ref={chartContainerRef} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}