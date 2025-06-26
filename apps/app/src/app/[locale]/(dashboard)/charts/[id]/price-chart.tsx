'use client'

import React, { useEffect, useRef, useMemo, useState } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineData,
  HistogramData,
  Time,
  LastPriceAnimationMode,
  LineSeries,
  HistogramSeries,
} from 'lightweight-charts'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Skeleton } from "@v1/ui/skeleton"
import { createRoot } from "react-dom/client"
import NumberFlow from '@number-flow/react'
import type { CoinMarketData, OHLCVQuote } from '@/types/coins'
import { motion } from 'framer-motion'
import { cn } from "@v1/ui/cn"

interface PriceChartProps {
  coinId: string;
  initialData: CoinMarketData['quote']['USD'];
}

interface PriceDataPoint {
  time: Time
  value: number
}

interface VolumeDataPoint {
  time: Time
  value: number
  color?: string
}

const TooltipContent = ({
  price,
  volume,
  timestamp,
}: {
  price: number
  volume?: number
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
        <div className="flex items-center gap-2 py-0.5">
          <span className="font-mono text-sm font-semibold text-foreground">
            ${price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </span>
        </div>
        {volume !== undefined && (
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-xs text-muted-foreground">Volume:</span>
            <span className="font-mono text-xs text-foreground">
              ${volume.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              })}
            </span>
          </div>
        )}
      </div>
    </div>
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
    { value: "1d", label: "1H" },
    { value: "30d", label: "1D" },
    { value: "7d", label: "1W" },
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

function filterValidVolumeData(data: VolumeDataPoint[]): VolumeDataPoint[] {
  return (
    data?.filter(
      (item) =>
        item &&
        typeof item.time === "number" &&
        typeof item.value === "number" &&
        !isNaN(item.value) &&
        isFinite(item.value) &&
        item.value > 0,
    ) || []
  )
}

export function PriceChart({ coinId, initialData }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [activePrice, setActivePrice] = useState<number | null>(null)
  const [activeTimeScale, setActiveTimeScale] = useState<string>("max")
  const [tokenData, setTokenData] = useState<CoinMarketData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch data when time scale changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/coins/${coinId}?timeScale=${activeTimeScale}`)
        if (!response.ok) throw new Error('Failed to fetch data')
        const data = await response.json()
        setTokenData(data)
      } catch (error) {
        console.error('Failed to fetch token data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [coinId, activeTimeScale])

  const { chartData, volumeData } = useMemo(() => {
    // Try to use OHLCV data first, then fall back to historical data
    if (tokenData?.ohlcv?.data?.quotes?.length) {
      const ohlcvQuotes = tokenData.ohlcv.data.quotes as OHLCVQuote[];
      
      const pricePoints = ohlcvQuotes.map(quote => ({
        time: (new Date(quote.time_close).getTime() / 1000) as Time,
        value: quote.quote.USD.close
      }));

      const volumePoints = ohlcvQuotes.map(quote => ({
        time: (new Date(quote.time_close).getTime() / 1000) as Time,
        value: quote.quote.USD.volume,
        color: '#ffffff40'
      }));

      return {
        chartData: filterValidPriceData(pricePoints),
        volumeData: filterValidVolumeData(volumePoints)
      };
    }
    
    // Fallback to historical data or generate sample data
    if (tokenData?.historical?.data?.quotes?.length) {
      const pricePoints = tokenData.historical.data.quotes.map(quote => ({
        time: (new Date(quote.timestamp).getTime() / 1000) as Time,
        value: quote.quote.USD.price
      }));

      const volumePoints = tokenData.historical.data.quotes.map(quote => ({
        time: (new Date(quote.timestamp).getTime() / 1000) as Time,
        value: quote.quote.USD.volume_24h || 0,
        color: '#ffffff40'
      }));

      return {
        chartData: filterValidPriceData(pricePoints),
        volumeData: filterValidVolumeData(volumePoints)
      };
    }

    // Generate fallback data
    const fallbackData = Array.from({ length: 30 }, (_, i) => {
      const time = ((Date.now() - (30 - i) * 24 * 60 * 60 * 1000) / 1000) as Time;
      const price = initialData.price * (0.95 + Math.random() * 0.1);
      const volume = initialData.volume_24h * (0.5 + Math.random() * 1.5);
      
      return {
        price: { time, value: price },
        volume: { time, value: volume, color: '#ffffff40' }
      };
    });
    
    fallbackData.push({
      price: { time: (Date.now() / 1000) as Time, value: initialData.price },
      volume: { time: (Date.now() / 1000) as Time, value: initialData.volume_24h, color: '#ffffff40' }
    });

    return {
      chartData: filterValidPriceData(fallbackData.map(d => d.price)),
      volumeData: filterValidVolumeData(fallbackData.map(d => d.volume))
    };
  }, [tokenData, initialData]);

  const displayPrice = activePrice ?? (tokenData?.quote.USD.price || initialData.price)
  
  const calculatePercentageChange = useMemo(() => {
    const currentPrice = displayPrice;
    const oldestPrice = chartData[0]?.value;
    if (!oldestPrice) return 0;
    
    return ((currentPrice - oldestPrice) / oldestPrice) * 100;
  }, [displayPrice, chartData]);

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return

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
          color: "#e5e7eb20",
          style: LineStyle.Dotted,
        },
        horzLines: { 
          visible: true,
          color: "#f5f5f510",
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

    // Create price line series
    const lineSeries = chart.addSeries(LineSeries, {
      lineWidth: 1,
      lastValueVisible: true,
      visible: true,
      priceLineVisible: false,
      color: '#ffffff',
      lastPriceAnimation: LastPriceAnimationMode.Continuous,
      priceFormat: {
        type: "price",
        precision: 2,
        minMove: 0.01,
      },
    })

    // Create volume histogram series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#ffffff40',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
    })

    // Set separate price scale for volume
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })
    
    lineSeries.setData(chartData)
    volumeSeries.setData(volumeData)
    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: 400, // Increased height to accommodate volume bars
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
        setActivePrice(null)
        return
      }

      if (!chartContainerRef.current) return
      const chartRect = chartContainerRef.current.getBoundingClientRect()

      const priceData = param.seriesData.get(lineSeries) as LineData<Time>
      const volumeData = param.seriesData.get(volumeSeries) as HistogramData<Time>
      
      if (priceData) {
        setActivePrice(priceData.value)
        
        tooltipEl.style.display = "block"
        tooltipRoot.render(
          <TooltipContent
            price={priceData.value}
            volume={volumeData?.value}
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
      } else {
        tooltipEl.style.display = "none"
        setActivePrice(null)
      }
    })

    return () => {
      window.removeEventListener("resize", handleResize)
      requestAnimationFrame(() => {
        tooltipRoot.unmount()
        document.body.removeChild(tooltipEl)
      })
      chart.remove()
    }
  }, [chartData, volumeData])

  if (isLoading) {
    return <Skeleton className="h-[500px] w-full rounded-[13px]" />
  }

  return (
      <div className="border border-zinc-800/30 rounded-[13px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        <div className="p-0 relative">
          <div
            className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-40"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
            }}
          />
          <Card className="border-none bg-transparent">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex flex-col items-left">
                <span className="text-xl font-mono">
                  <NumberFlow
                    value={displayPrice}
                    format={{
                      style: 'currency',
                      currency: 'USD',
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }}
                    transformTiming={{ duration: 400, easing: 'ease-out' }}
                    continuous={true}
                  />
                </span>
                <div className={`text-sm ${calculatePercentageChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  <motion.span
                    initial={{ rotate: calculatePercentageChange >= 0 ? 0 : 180 }}
                    animate={{ rotate: calculatePercentageChange >= 0 ? 0 : 180 }}
                    transition={{ type: "spring", bounce: 0.3, duration: 0.3 }}
                    className="inline-block mr-2"
                    style={{ transformOrigin: 'center' }}
                  >
                    ▲
                  </motion.span>
                  <NumberFlow
                    value={Math.abs(calculatePercentageChange)}
                    format={{ 
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }}
                    suffix="%"
                    transformTiming={{ duration: 400, easing: 'ease-out' }}
                    continuous={true}
                  />
                </div>
              </CardTitle>
              <TimeScaleSelector
                activeTimeScale={activeTimeScale}
                setActiveTimeScale={setActiveTimeScale}
              />
            </CardHeader>
            <CardContent className="pl-8">
              <div className="p-0 relative">
                <div ref={chartContainerRef} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
  )
}