'use client'

import React, { useRef, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Button } from "@v1/ui/button"
import { Switch } from "@v1/ui/switch"
import { Label } from "@v1/ui/label"
import { Slider } from "@v1/ui/slider"
import { Popover, PopoverContent, PopoverTrigger } from "@v1/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@v1/ui/tabs"
import { Badge } from "@v1/ui/badge"
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { cn } from "@v1/ui/cn"
import { useMarketCipherB } from '@/hooks/use-market-cipher-b'
import { useCoinGeckoChartData } from '@/hooks/use-coingecko-chart-data'
import { IconGear} from 'symbols-react'
import type { CoinMarketData } from '@/types/coins'
import { loadLightweightCharts, type LightweightChartsModule } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'

interface MarketCipherBProps {
  coinId: string
  initialData: CoinMarketData['quote']['USD']
  activeTimeScale: string
  className?: string
}

interface DisplaySettings {
  showWaveTrend: boolean
  showFastMoneyFlow: boolean
  showSlowMoneyFlow: boolean
  showRSI: boolean
  showStochRSI: boolean
  showCrosses: boolean
  showDivergences: boolean
  showLevels: boolean
}

const ColorPicker = ({ value, onChange, label }: { value: string, onChange: (color: string) => void, label: string }) => {
  const colors = [
    '#00FFEB', '#0041FF', '#FF0000', '#00FF08', '#FFFF00', 
    '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#FFC0CB'
  ]
  
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1">
        {colors.map((color) => (
          <button
            type="button"
            key={color}
            className={cn(
              "w-6 h-6 rounded border-2 transition-all",
              value === color ? "border-white scale-110" : "border-gray-600 hover:border-gray-400"
            )}
            style={{ backgroundColor: color }}
            aria-label={`${label}: ${color}`}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  )
}

export function MarketCipherB({ coinId, initialData, activeTimeScale, className }: MarketCipherBProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const lightweightChartsRef = useRef<LightweightChartsModule | null>(null)
  
  // Get the same data as the price chart
  const { chartData, volumeData, ohlcData } = useCoinGeckoChartData(coinId, activeTimeScale, initialData)
  
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>({
    showWaveTrend: true,
    showFastMoneyFlow: true,
    showSlowMoneyFlow: true,
    showRSI: false,
    showStochRSI: false,
    showCrosses: true,
    showDivergences: true,
    showLevels: true
  })

  const [colors, setColors] = useState({
    waveTrend1: '#00FFEB',
    waveTrend2: '#0041FF',
    fastMoneyFlow: '#00FF08',
    slowMoneyFlow: '#FF0000',
    rsi: '#D4F321',
    stochK: '#F700FF',
    stochD: '#2195F3'
  })

  const [config, setConfig] = useState({
    wtChannelLength: 9,
    wtChannelAverageLength: 21,
    wtObLevel1: 60,
    wtOsLevel1: -60,
    fastMoneyFlowLength: 9,
    slowMoneyFlowLength: 10,
    rsiLength: 14,
    stochLength: 14
  })

  // Convert price/volume data to OHLCV format for Market Cipher B
  const ohlcvData = React.useMemo(() => {
    if (!chartData.length) return []

    // Use real OHLC data from CoinGecko if available
    if (ohlcData.length > 0) {
      return ohlcData.map((point, index) => ({
        time: point.time,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: volumeData[index]?.value || 0 // Add volume data
      }))
    }

    // Fallback: generate OHLCV from price data (approximate)
    return chartData.map((point: { time: Time; value: number }, index: number) => {
      const price = point.value
      const volume = volumeData[index]?.value || 0
      
      // For approximation, use price as all OHLC values
      return {
        time: point.time,
        open: price,
        high: price * 1.01, // Approximate 1% high
        low: price * 0.99,  // Approximate 1% low
        close: price,
        volume
      }
    })
  }, [chartData, volumeData, ohlcData])

  const calculations = useMarketCipherB(ohlcvData, config)

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    let isCancelled = false
    let cleanup: (() => void) | null = null

    // Capture the current seriesRefs to avoid stale closure issues
    const currentSeriesRefs = seriesRefs.current

    void (async () => {
      const lightweightCharts = await loadLightweightCharts()
      lightweightChartsRef.current = lightweightCharts

      const { createChart, ColorType, CrosshairMode, LineStyle } = lightweightCharts

      if (isCancelled || !chartContainerRef.current) return

      const chart = createChart(chartContainerRef.current, {
        handleScale: false,
        handleScroll: false,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#ffffff50",
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: true, color: "#f5f5f510", style: LineStyle.Dotted },
        },
        rightPriceScale: { 
          borderVisible: false, 
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 }
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: { labelVisible: true, width: 1, color: "#d1d5db40", visible: true, style: LineStyle.Solid },
          horzLine: { visible: false, labelVisible: false },
        },
        timeScale: { timeVisible: true, secondsVisible: false, borderVisible: false },
      })

      chartRef.current = chart

      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: 400,
          })
        }
      }

      // Prefer observing the actual container size (avoids per-chart global resize listeners).
      let resizeObserver: ResizeObserver | null = null
      let resizeRafId: number | null = null
      let unsubscribeWindowResize: (() => void) | null = null

      if (typeof ResizeObserver !== "undefined" && chartContainerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          if (resizeRafId) cancelAnimationFrame(resizeRafId)
          resizeRafId = requestAnimationFrame(() => handleResize())
        })
        resizeObserver.observe(chartContainerRef.current)
      } else {
        unsubscribeWindowResize = subscribeToWindowResize(handleResize)
      }

      handleResize()

      cleanup = () => {
        if (resizeRafId) cancelAnimationFrame(resizeRafId)
        resizeObserver?.disconnect()
        unsubscribeWindowResize?.()
        chart.remove()
        chartRef.current = null
        currentSeriesRefs.clear()
      }
    })()

    return () => {
      isCancelled = true
      cleanup?.()
    }
  }, [])

  // Update series based on display settings and calculations
  useEffect(() => {
    if (!chartRef.current || !calculations.waveTrend1.length) return

    const lightweightCharts = lightweightChartsRef.current
    if (!lightweightCharts) return
    const { LineSeries, LastPriceAnimationMode } = lightweightCharts

    const chart = chartRef.current
    
    // Clear existing series
    seriesRefs.current.forEach(series => {
      try {
        chart.removeSeries(series)
      } catch {
        // Series might already be removed
      }
    })
    seriesRefs.current.clear()

    // Add WaveTrend series
    if (displaySettings.showWaveTrend) {
      const wt1Series = chart.addSeries(LineSeries, {
        lineWidth: 2,
        color: colors.waveTrend1,
        title: 'WT1',
        lastPriceAnimation: LastPriceAnimationMode.Continuous,
      })
      
      const wt2Series = chart.addSeries(LineSeries, {
        lineWidth: 2,
        color: colors.waveTrend2,
        title: 'WT2',
        lastPriceAnimation: LastPriceAnimationMode.Continuous,
      })

      wt1Series.setData(calculations.waveTrend1)
      wt2Series.setData(calculations.waveTrend2)
      
      seriesRefs.current.set('wt1', wt1Series)
      seriesRefs.current.set('wt2', wt2Series)
    }

    // Add Money Flow series (same scale as WaveTrend)
    if (displaySettings.showFastMoneyFlow && calculations.fastMoneyFlow.length) {
      const fastMFSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: `${colors.fastMoneyFlow}60`,
        title: 'Fast MF',
      })
      
      fastMFSeries.setData(calculations.fastMoneyFlow)
      seriesRefs.current.set('fastMF', fastMFSeries)
    }

    if (displaySettings.showSlowMoneyFlow && calculations.slowMoneyFlow.length) {
      const slowMFSeries = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color: `${colors.slowMoneyFlow}60`,
        title: 'Slow MF',
      })
      
      slowMFSeries.setData(calculations.slowMoneyFlow)
      seriesRefs.current.set('slowMF', slowMFSeries)
    }

    // Add RSI series (same scale as WaveTrend)
    if (displaySettings.showRSI && calculations.rsiValues.length) {
      const rsiSeries = chart.addSeries(LineSeries, {
        lineWidth: 2,
        color: colors.rsi,
        title: 'RSI',
      })
      
      rsiSeries.setData(calculations.rsiValues)
      seriesRefs.current.set('rsi', rsiSeries)
    }

    // Add Stochastic RSI series (same scale as WaveTrend)
    if (displaySettings.showStochRSI) {
      if (calculations.stochK.length) {
        const stochKSeries = chart.addSeries(LineSeries, {
          lineWidth: 2,
          color: colors.stochK,
          title: 'Stoch %K',
        })
        
        stochKSeries.setData(calculations.stochK)
        seriesRefs.current.set('stochK', stochKSeries)
      }

      if (calculations.stochD.length) {
        const stochDSeries = chart.addSeries(LineSeries, {
          lineWidth: 2,
          color: colors.stochD,
          title: 'Stoch %D',
        })
        
        stochDSeries.setData(calculations.stochD)
        seriesRefs.current.set('stochD', stochDSeries)
      }
    }

    chart.timeScale().fitContent()
  }, [calculations, displaySettings, colors])

  const toggleDisplay = (key: keyof DisplaySettings) => {
    setDisplaySettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const updateConfig = (key: string, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const updateColor = (key: string, color: string) => {
    setColors(prev => ({ ...prev, [key]: color }))
  }

  const activeCount = Object.values(displaySettings).filter(Boolean).length

  // Show loading state if no data
  if (!ohlcvData.length) {
    return (
      <Card className={cn("border border-zinc-800/30 rounded-[13px] overflow-hidden", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-lg font-semibold">Market Cipher B</span>
            <Badge variant="secondary" className="text-xs">
              WeloTrades
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">Loading Market Cipher B data...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("border border-zinc-800/30 rounded-[13px] overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between p-4">
        <CardTitle className="flex items-center gap-2">
          <span className="text-lg font-semibold">Market Cipher B</span>
          <Badge variant="secondary" className="text-xs">
            WeloTrades
          </Badge>
        </CardTitle>
        
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <IconGear className="w-4 h-4" />
                Settings
                {activeCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {activeCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96" align="end">
              <Tabs defaultValue="display" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="display">Display</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                  <TabsTrigger value="colors">Colors</TabsTrigger>
                </TabsList>
                
                <TabsContent value="display" className="space-y-4">
                  <div className="space-y-3">
                    {Object.entries(displaySettings).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <Label className="text-sm capitalize">
                          {key.replace(/([A-Z])/g, ' $1').replace(/^show/, '').trim()}
                        </Label>
                        <Switch
                          checked={value}
                          onCheckedChange={() => toggleDisplay(key as keyof DisplaySettings)}
                        />
                      </div>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="settings" className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm">WT Channel Length: {config.wtChannelLength}</Label>
                      <Slider
                        value={[config.wtChannelLength]}
                        onValueChange={(values) => updateConfig('wtChannelLength', values[0] || 9)}
                        min={5}
                        max={50}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-sm">WT Average Length: {config.wtChannelAverageLength}</Label>
                      <Slider
                        value={[config.wtChannelAverageLength]}
                        onValueChange={(values) => updateConfig('wtChannelAverageLength', values[0] || 21)}
                        min={10}
                        max={100}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-sm">RSI Length: {config.rsiLength}</Label>
                      <Slider
                        value={[config.rsiLength]}
                        onValueChange={(values) => updateConfig('rsiLength', values[0] || 14)}
                        min={5}
                        max={50}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="colors" className="space-y-4">
                  <div className="space-y-4">
                    <ColorPicker
                      value={colors.waveTrend1}
                      onChange={(color) => updateColor('waveTrend1', color)}
                      label="WaveTrend 1"
                    />
                    <ColorPicker
                      value={colors.waveTrend2}
                      onChange={(color) => updateColor('waveTrend2', color)}
                      label="WaveTrend 2"
                    />
                    <ColorPicker
                      value={colors.fastMoneyFlow}
                      onChange={(color) => updateColor('fastMoneyFlow', color)}
                      label="Fast Money Flow"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div 
          ref={chartContainerRef} 
          className="w-full h-[400px] relative"
        />
      </CardContent>
    </Card>
  )
}