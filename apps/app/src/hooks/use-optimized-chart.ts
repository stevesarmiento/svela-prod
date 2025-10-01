'use client'

import { useRef, useEffect, useMemo, useCallback } from 'react'
import { createChart, IChartApi, ColorType, CrosshairMode, LineStyle, MouseEventParams } from 'lightweight-charts'
import { useIsomorphicTheme } from './use-isomorphic-theme'

export interface ChartConfig {
  height?: number
  showTimeScale?: boolean
  showRightPriceScale?: boolean
  showGrid?: boolean
  showCrosshair?: boolean
}

export interface UseOptimizedChartOptions extends ChartConfig {
  onCrosshairMove?: (chart: IChartApi, param: MouseEventParams) => void
  onChartReady?: (chart: IChartApi) => void
}

/**
 * Optimized chart hook that eliminates useEffect anti-patterns
 * Provides memoized chart configuration and proper cleanup
 */
export function useOptimizedChart(options: UseOptimizedChartOptions = {}) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const { isDarkMode } = useIsomorphicTheme()
  
  // Refs for callback functions to avoid chart recreation when callbacks change
  const onCrosshairMoveRef = useRef(options.onCrosshairMove)
  const onChartReadyRef = useRef(options.onChartReady)
  
  const {
    height = 400,
    showTimeScale = false,
    showRightPriceScale = true,
    showGrid = false,
    showCrosshair = true,
    onCrosshairMove,
    onChartReady
  } = options

  // Memoize chart configuration to prevent unnecessary recreations
  const chartConfig = useMemo(() => ({
    handleScale: false,
    handleScroll: false,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: isDarkMode ? "#ffffff50" : "#00000050",
      attributionLogo: false,
    },
    grid: {
      vertLines: { 
        visible: showGrid,
        color: isDarkMode ? "#e5e7eb20" : "#00000020",
        style: LineStyle.Dotted,
      },
      horzLines: { 
        visible: showGrid,
        color: isDarkMode ? "#ffffff10" : "#00000010",
        style: LineStyle.Solid,
      },
    },
    rightPriceScale: {
      borderVisible: false,
      autoScale: true,
      visible: showRightPriceScale,
      entireTextOnly: true,
    },
    crosshair: {
      mode: showCrosshair ? CrosshairMode.Magnet : CrosshairMode.Hidden,
      vertLine: {
        labelVisible: showCrosshair,
        width: 1 as const,
        color: isDarkMode ? "#d1d5db40" : "#00000040",
        visible: showCrosshair,
        style: LineStyle.Solid,
      },
      horzLine: {
        visible: false,
        labelVisible: false,
      },
    },
    timeScale: {
      visible: showTimeScale,
      timeVisible: showTimeScale,
      secondsVisible: false,
      borderVisible: false,
    },
  }), [isDarkMode, showTimeScale, showRightPriceScale, showGrid, showCrosshair])

  // Keep callback refs updated with latest values
  useEffect(() => {
    onCrosshairMoveRef.current = onCrosshairMove
    onChartReadyRef.current = onChartReady
  })

  // Memoize resize handler
  const resizeHandler = useCallback(() => {
    if (chartRef.current && chartContainerRef.current) {
      chartRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: height,
      })
    }
  }, [height])

  // Chart initialization effect
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, chartConfig)
    chartRef.current = chart

    // Initial resize
    resizeHandler()

    // Set up resize listener
    window.addEventListener("resize", resizeHandler)
    
    // Set up crosshair move handler
    if (onCrosshairMoveRef.current) {
      chart.subscribeCrosshairMove((param) => onCrosshairMoveRef.current?.(chart, param))
    }

    // Fit content to chart
    chart.timeScale().fitContent()

    // Call ready callback
    if (onChartReadyRef.current) {
      onChartReadyRef.current(chart)
    }

    return () => {
      window.removeEventListener("resize", resizeHandler)
      chart.remove()
      chartRef.current = null
    }
  }, [chartConfig, resizeHandler])

  return {
    chartContainerRef,
    chartRef,
    isDarkMode,
    resizeChart: resizeHandler,
  }
}

/**
 * Simplified hook for basic line charts
 */
export function useLineChart(height: number = 400) {
  return useOptimizedChart({ 
    height, 
    showGrid: false, 
    showTimeScale: false 
  })
}

/**
 * Hook for trading charts with full features
 */
export function useTradingChart(height: number = 400) {
  return useOptimizedChart({ 
    height, 
    showGrid: true, 
    showTimeScale: true,
    showRightPriceScale: true,
    showCrosshair: true
  })
}
