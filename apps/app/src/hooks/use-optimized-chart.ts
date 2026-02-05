'use client'

import { useRef, useEffect, useCallback } from 'react'
import type { IChartApi, MouseEventParams } from 'lightweight-charts'
import { useIsomorphicTheme } from './use-isomorphic-theme'
import { loadLightweightCharts } from '@/lib/load-lightweight-charts'
import { subscribeToWindowResize } from '@/hooks/window-resize-store'

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

    let isCancelled = false
    let chart: IChartApi | null = null
    let resizeObserver: ResizeObserver | null = null
    let resizeRafId: number | null = null
    let unsubscribeWindowResize: (() => void) | null = null

    void (async () => {
      const { createChart, ColorType, CrosshairMode, LineStyle } =
        await loadLightweightCharts()

      if (isCancelled || !chartContainerRef.current) return

      const createdChart = createChart(chartContainerRef.current, {
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
      })

      chart = createdChart
      chartRef.current = createdChart

      // Initial resize
      resizeHandler()

      // Prefer observing the actual container size (avoids per-chart global resize listeners).
      if (typeof ResizeObserver !== "undefined" && chartContainerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          if (resizeRafId) cancelAnimationFrame(resizeRafId)
          resizeRafId = requestAnimationFrame(() => resizeHandler())
        })
        resizeObserver.observe(chartContainerRef.current)
      } else {
        unsubscribeWindowResize = subscribeToWindowResize(resizeHandler)
      }
      
      // Set up crosshair move handler
      if (onCrosshairMoveRef.current) {
        createdChart.subscribeCrosshairMove((param) => onCrosshairMoveRef.current?.(createdChart, param))
      }

      // Fit content to chart
      createdChart.timeScale().fitContent()

      // Call ready callback
      if (onChartReadyRef.current) {
        onChartReadyRef.current(createdChart)
      }
    })()

    return () => {
      isCancelled = true
      if (resizeRafId) cancelAnimationFrame(resizeRafId)
      resizeObserver?.disconnect()
      unsubscribeWindowResize?.()
      chart?.remove()
      chartRef.current = null
    }
  }, [isDarkMode, showTimeScale, showRightPriceScale, showGrid, showCrosshair, resizeHandler])

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
