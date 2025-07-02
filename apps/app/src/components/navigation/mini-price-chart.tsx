'use client'

import React, { useRef, useEffect } from 'react'
import { createChart, ColorType, LineStyle, IChartApi, LineSeries, HistogramSeries, Time, LineData } from 'lightweight-charts'
import { useMiniChartData } from '@/hooks/use-mini-chart-data'
import { Spinner } from '@v1/ui/spinner'
import { createRoot } from "react-dom/client"
import { useHullSuite } from '@/hooks/use-hull-suite'

interface MiniPriceChartProps {
  coinId: string
  tokenSymbol?: string
  currentPrice?: number
}

const TooltipContent = ({ data, tokenSymbol }: { data: { time: number; price: number; change: number; volume: number; hull?: number }, tokenSymbol?: string }) => {
  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(2)}K`
    return `$${vol.toFixed(2)}`
  }
  const formatPrice = (price: number) => {
    return '$' + price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }
  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <div className="px-4 py-3">
        <div className="mb-3 text-[11px] text-zinc-400 font-medium">
          {data.time ? new Date(data.time * 1000).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : ''}
        </div>
        <div className="w-full h-[1px] mb-3 bg-zinc-700/50 scale-125" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Price</span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono px-1.5 h-4 rounded ${data.change >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>{data.change > 0 ? '+' : ''}{data.change.toFixed(2)}%</span>
              <span className="text-[11px] font-mono font-bold">{formatPrice(data.price)}</span>
            </div>
          </div>
          {typeof data.hull === 'number' && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">Hull MA</span>
              <span className="text-[11px] font-mono text-blue-300">{formatPrice(data.hull)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Volume</span>
            <span className="text-[11px] font-mono text-zinc-300">{formatVolume(data.volume)}</span>
          </div>
          {tokenSymbol && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">Token</span>
              <span className="text-[11px] font-mono text-zinc-300">{tokenSymbol.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function MiniPriceChart({ coinId, tokenSymbol, currentPrice }: MiniPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const { chartData, volumeData, isLoading, priceChange24h } = useMiniChartData(coinId, currentPrice)

  const ohlcvData = React.useMemo(() => {
    if (!chartData.length) return []
    return chartData.map((point, idx) => {
      const price = point.value
      const volume = volumeData[idx]?.value || 0
      const prevPrice = idx > 0 ? chartData[idx - 1]?.value || price : price
      const open = prevPrice
      const close = price
      const high = Math.max(open, close)
      const low = Math.min(open, close)
      return {
        time: point.time,
        open,
        high,
        low,
        close,
        volume
      }
    })
  }, [chartData, volumeData])

  const hullSuite = useHullSuite(ohlcvData, {
    src: 'close',
    modeSwitch: 'Ehma',
    length: 55,
    lengthMult: 1.0,
    useHtf: false,
    htf: '240',
    switchColor: true,
    candleCol: false,
    visualSwitch: true,
    thicknesSwitch: 1,
    transpSwitch: 40,
  })

  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return

    if (chartRef.current) {
      try {
        chartRef.current.remove()
      } catch (error) {
        console.debug('Chart already disposed:', error)
      }
      chartRef.current = null
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
        fontSize: 10,
        attributionLogo: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 160,
      rightPriceScale: {
        visible: false,
      },
      leftPriceScale: {
        visible: false,
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: '#374151',
          style: LineStyle.Solid,
          visible: true,
        },
        horzLine: {
          visible: false,
        },
      },
      handleScroll: true,
      handleScale: true,
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: '#ffffff30',
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const lineSeries = chart.addSeries(LineSeries, {
      color: priceChange24h >= 0 ? '#10B981' : '#EF4444',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    let hullSeries: ReturnType<typeof chart.addSeries> | null = null
    if (hullSuite.MHULL.length > 0) {
      hullSeries = chart.addSeries(LineSeries, {
        color: 'rgba(59,130,246,0.7)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      hullSeries.setData(hullSuite.MHULL)
    }

    if (volumeData.length > 0) {
      volumeSeries.setData(volumeData)
    }

    lineSeries.setData(chartData)

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })

    chart.timeScale().fitContent()

    chartRef.current = chart

    const tooltipEl = document.createElement("div")
    const tooltipRoot = createRoot(tooltipEl)
    tooltipEl.className = "fixed z-[9999] hidden overflow-hidden text-[11px] text-white rounded-xl w-[200px] shadow-2xl pointer-events-none z-30 backdrop-blur-xl bg-zinc-900/95 border border-zinc-700/50 transition-all duration-100 ease-in-out"
    tooltipEl.style.cssText = ""
    document.body.appendChild(tooltipEl)

    chart.subscribeCrosshairMove((param) => {
      console.log('Crosshair move:', param)
      
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

      const priceData = param.seriesData.get(lineSeries) as LineData<Time>
      let volumeValue = 0

      const volumeDataPoint = param.seriesData.get(volumeSeries)
      if (volumeDataPoint && 'value' in volumeDataPoint) {
        volumeValue = volumeDataPoint.value as number
      }

      let hullValue: number | undefined = undefined
      if (hullSuite.MHULL.length > 0 && param.time) {
        const hullPoint = hullSuite.MHULL.find(point => point.time === param.time)
        if (hullPoint) hullValue = hullPoint.value
      }

      if (!priceData) {
        console.log('No price data available')
        tooltipEl.style.display = "none"
        return
      }

      const firstPrice = chartData[0]?.value || priceData.value
      const percentChange = firstPrice ? ((priceData.value - firstPrice) / firstPrice) * 100 : 0

      console.log('Showing tooltip:', {
        time: param.time,
        price: priceData.value,
        change: percentChange,
        volume: volumeValue
      })

      tooltipEl.style.display = "block"
      tooltipRoot.render(
        <TooltipContent
          data={{
            time: Number(param.time),
            price: priceData.value,
            change: percentChange,
            volume: volumeValue,
            hull: hullValue,
          }}
          tokenSymbol={tokenSymbol}
        />
      )

      const tooltipWidth = tooltipEl.offsetWidth
      const tooltipHeight = tooltipEl.offsetHeight

      let left = chartRect.left + param.point.x + 15
      let top = chartRect.top + param.point.y - tooltipHeight / 2

      if (left + tooltipWidth > window.innerWidth - 10) {
        left = chartRect.left + param.point.x - tooltipWidth - 15
      }

      if (top + tooltipHeight > window.innerHeight - 10) {
        top = window.innerHeight - tooltipHeight - 10
      }

      if (top < 10) {
        top = 10
      }

      tooltipEl.style.left = `${left}px`
      tooltipEl.style.top = `${top}px`
      
      console.log('Tooltip positioned at:', { left, top })
    })

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      requestAnimationFrame(() => {
        tooltipRoot.unmount()
        document.body.removeChild(tooltipEl)
      })
      if (chart) {
        try {
          chart.remove()
        } catch (error) {
          console.debug('Chart cleanup - already disposed:', error)
        }
      }
      chartRef.current = null
    }
  }, [chartData, volumeData, priceChange24h, tokenSymbol, hullSuite])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[120px] w-full">
        <Spinner className="w-4 h-4" />
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] w-full text-xs text-gray-500">
        No chart data available
      </div>
    )
  }

  return (
    <div className="w-full relative">
      
      <div
        className="absolute inset-0 z-[-1] size-full opacity-40 dark:opacity-20"
        style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1' fill='rgba(255,255,255,0.2)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
        }}
      />
        <div className="w-full">
          <div ref={chartContainerRef} className="w-full h-full" />
        </div>
    </div>
  )
} 