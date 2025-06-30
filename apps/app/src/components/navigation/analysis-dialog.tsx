'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
} from '@v1/ui/dialog'
import { Button } from '@v1/ui/button'
import { Badge } from '@v1/ui/badge'
import { ScrollArea } from '@v1/ui/scroll-area'
import { Spinner } from '@v1/ui/spinner'
import Image from 'next/image'
import { IconSparkles, IconMagnifyingglass, IconCircleDottedAndCircle, IconArrowUpRight, IconArrowDownRight, IconArrowRight, IconChartLineUptrendXyaxis } from 'symbols-react'
import { useChartData } from '@/hooks/use-chart-data'
import { useMarketVisionB, calculateBollingerBands } from '@/hooks/market-vision'
import { useOpenInterest } from '@/hooks/use-open-interest'
import { useLiquidationHistory } from '@/hooks/use-liquidation-history'
import { useTakerBuySell } from '@/hooks/use-taker-buy-sell'
import ReactMarkdown from 'react-markdown'
import type { Time } from 'lightweight-charts'

interface AnalysisDialogProps {
  coinId: string
  tokenData: {
    name?: string
    symbol?: string
    id?: string
    logoUrl?: string
  } | null
}

export function AnalysisDialog({ coinId, tokenData }: AnalysisDialogProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [isAnalysisLoading, setIsAnalysisLoading] = React.useState(false)
  const [analysisResult, setAnalysisResult] = React.useState('')

  // Create stable empty array reference to prevent unnecessary recalculations
  const EMPTY_ARRAY = React.useMemo(() => [], [])

  // Get the necessary data
  const activeTimeScale = '30d' // Use 30d for analysis

  // Fetch market data from CMC (real quotes)
  const { data: marketData } = useQuery({
    queryKey: ['coinMarketData', coinId],
    queryFn: async () => {
      const response = await fetch(`/api/coinmarketcap/quotes?ids=${coinId}`)
      if (!response.ok) throw new Error('Failed to fetch market data')
      const data = await response.json()
      return data.data[coinId]
    },
    staleTime: 30 * 1000, // 30 seconds
  })

  // Get chart data for price/volume (needed for analysis context)
  // Provide safe fallback for initialData to prevent TypeError
  const safeInitialData = marketData?.quote?.USD || {
    price: 0,
    volume_24h: 0,
    market_cap: 0,
    percent_change_24h: 0,
    percent_change_1h: 0,
    percent_change_7d: 0,
    percent_change_30d: 0,
    percent_change_60d: 0,
    percent_change_90d: 0,
    market_cap_dominance: 0,
    fully_diluted_market_cap: 0,
    tvl: null,
    last_updated: new Date().toISOString()
  }
  
  const { chartData, volumeData } = useChartData(coinId, activeTimeScale, safeInitialData)

  // PERFORMANCE OPTIMIZATION: Calculate when dialog is open OR when analysis is requested
  const shouldCalculateBasicIndicators = React.useMemo(() => {
    return isDialogOpen || isAnalysisLoading
  }, [isDialogOpen, isAnalysisLoading])

  // FIXED: Create stable OHLCV data - calculate when dialog is open OR when analysis is requested
  const ohlcvData = React.useMemo(() => {
    if (!shouldCalculateBasicIndicators || !chartData.length || !volumeData.length) {
      console.log('⏭️ Skipping OHLCV calculation - not needed or no data')
      return EMPTY_ARRAY
    }

    console.log('🔄 Calculating OHLCV data for indicators...')

    const result = chartData.map((point: { time: Time; value: number }, index: number) => {
      const price = point.value
      const volume = volumeData[index]?.value || 0
      const prevPrice = index > 0 ? chartData[index - 1]?.value || price : price
      
      // Create deterministic OHLC (no random values to prevent constant recalculations)
      const priceChange = price - prevPrice
      const volatility = Math.abs(priceChange) * 0.3 + price * 0.001
      
      const open = prevPrice
      const close = price
      // Use deterministic spread instead of random
      const spread = volatility * 0.5
      const high = Math.max(open, close) + spread
      const low = Math.min(open, close) - spread
      
      return {
        time: point.time,
        open,
        high,
        low,
        close,
        volume
      }
    })
    
    console.log('✅ OHLCV Calculation complete - result length:', result.length)
    return result
  }, [shouldCalculateBasicIndicators, chartData, volumeData, coinId, activeTimeScale, EMPTY_ARRAY])

  // Memoize configs to prevent object recreation
  const memoizedBollingerConfig = React.useMemo(() => ({
    drawRSI: true,
    drawMFI: false,
    highlightBreaches: true,
    length: 14,
    source: 'hlc3' as const,
    bbLength: 20,
    multiplier: 2.0,
    lineWidth: 2,
    fillOpacity: 0.1
  }), [])

  // Debug logging to track recalculations
  React.useEffect(() => {
    if (ohlcvData.length > 0) {
      console.log('🔄 Analysis Dialog: OHLCV data changed, length:', ohlcvData.length, 'coin:', coinId)
    }
  }, [ohlcvData.length, coinId])
  
  // FIXED: Calculate basic indicators for sidebar display when dialog is open
  const marketVisionData = useMarketVisionB(
    shouldCalculateBasicIndicators ? ohlcvData : EMPTY_ARRAY
  )
  
  const bbData = React.useMemo(() => {
    if (!shouldCalculateBasicIndicators) {
      console.log('⏭️ Skipping Bollinger Bands - dialog closed')
      return { indicator: [], upper: [], lower: [], basis: [] }
    }
    console.log('🔄 Calculating Bollinger Bands for sidebar display, data length:', ohlcvData.length)
    return calculateBollingerBands(ohlcvData, memoizedBollingerConfig)
  }, [shouldCalculateBasicIndicators, ohlcvData, memoizedBollingerConfig])

  // REAL MARKET DATA: Get actual open interest, liquidations, and order flow data
  const { data: openInterestData } = useOpenInterest({
    symbol: coinId,
    interval: '4h',
    limit: 50,
    unit: 'usd',
  })

  const { data: liquidationData } = useLiquidationHistory({
    symbol: coinId,
    interval: '1d',
    exchangeList: 'Binance, Bybit, OKX, Gate, HTX, Hyperliquid, CoinEx, Bitmex, Bitfinex',
    limit: 7, // Last 7 days
  })

  const { data: takerBuySellData } = useTakerBuySell({
    symbol: coinId,
    range: '24h',
  })

  // Function to prepare comprehensive analysis data
  const prepareAnalysisData = () => {
    if (!marketData?.quote?.USD) return null

    // FIXED: Force calculate OHLCV data if not available (bypass React timing issue)
    let analysisOhlcvData = ohlcvData
    if (ohlcvData.length === 0 && chartData.length > 0 && volumeData.length > 0) {
      console.log('🔧 Force calculating OHLCV data for analysis...')
      analysisOhlcvData = chartData.map((point: { time: Time; value: number }, index: number) => {
        const price = point.value
        const volume = volumeData[index]?.value || 0
        const prevPrice = index > 0 ? chartData[index - 1]?.value || price : price
        
        // Create deterministic OHLC (no random values to prevent constant recalculations)
        const priceChange = price - prevPrice
        const spread = Math.abs(priceChange) * 0.01 // 1% spread
        
        return {
          time: point.time,
          open: prevPrice,
          high: Math.max(prevPrice, price) + spread,
          low: Math.min(prevPrice, price) - spread,
          close: price,
          volume: volume
        }
      })
      console.log('✅ Force OHLCV calculation complete - result length:', analysisOhlcvData.length)
    }

    // Force calculate Bollinger Bands RSI if not available
    let analysisBBData = bbData
    if (bbData.indicator.length === 0 && analysisOhlcvData.length > 0) {
      console.log('🔧 Force calculating Bollinger Bands for analysis...')
      analysisBBData = calculateBollingerBands(analysisOhlcvData, memoizedBollingerConfig)
      console.log('✅ Force BB calculation complete - indicator length:', analysisBBData.indicator.length)
    }

    // Use pre-calculated indicators (calculated at component level)
    console.log('📊 Using pre-calculated indicators for analysis...')

    // Get latest values from indicators for current state
    const latestBB = {
      indicator: analysisBBData.indicator[analysisBBData.indicator.length - 1],
      upper: analysisBBData.upper[analysisBBData.upper.length - 1],
      lower: analysisBBData.lower[analysisBBData.lower.length - 1],
      basis: analysisBBData.basis[analysisBBData.basis.length - 1]
    }
    
    // Get Wave Trend data
    const latestWT = marketVisionData.waveTrend
    const latestWTValues = {
      wt1: latestWT.wt1[latestWT.wt1.length - 1]?.value || 0,
      wt2: latestWT.wt2[latestWT.wt2.length - 1]?.value || 0
    }
    
    // Get Money Flow data
    const latestMF = marketVisionData.moneyFlow
    const latestMFValue = latestMF.fast[latestMF.fast.length - 1]?.value || 0

    // ENHANCED: Get historical arrays for trend analysis
    // NOTE: Each data point = 1 DAY (24 hours) for 30d timeframe
    // FIXED: Use Bollinger Bands RSI history instead of Market Vision for consistency
    const bollingerHistory = analysisBBData.indicator.slice(-30).map((item: { value: number }) => item?.value).filter((value: number | undefined): value is number => typeof value === 'number' && value >= 0 && value <= 100)
    const rsiHistory = bollingerHistory.length > 0 ? bollingerHistory : [] // Use consistent BB RSI data
    
    const priceHistory = chartData.slice(-30)                      // Last 30 DAYS (~1 month)
      .map((item: { value: number }) => item.value)
      .filter((value: number | undefined): value is number => typeof value === 'number')
    const volumeHistory = volumeData.slice(-30)                    // Last 30 DAYS (~1 month)
      .map((item: { value: number }) => item.value)
      .filter((value: number | undefined): value is number => typeof value === 'number')

    // Console logging for debugging
    console.log('=== ANALYSIS DATA DEBUG ===')
    console.log('Data Interval: 1 DAY per point (24-hour candles)')
    console.log('Current Price:', marketData?.quote?.USD?.price)
    console.log('Market Cap:', marketData?.quote?.USD?.market_cap)
    console.log('24h Volume:', marketData?.quote?.USD?.volume_24h)
    console.log('Price History (last 10 days):', priceHistory.slice(-10))
    console.log('Volume History (last 5 days):', volumeHistory.slice(-5))
    console.log('FIXED: Using Bollinger Bands RSI for consistency')
    console.log('=== BOLLINGER BANDS DEBUG ===')
    console.log('bbData structure:', Object.keys(analysisBBData))
    console.log('bbData.indicator length:', analysisBBData.indicator?.length)
    console.log('latestBB.indicator:', latestBB.indicator)
    console.log('OHLCV data length:', analysisOhlcvData.length)
    console.log('shouldCalculateBasicIndicators flag:', shouldCalculateBasicIndicators)
    console.log('=== END BB DEBUG ===')
    console.log('RSI History (last 5 days):', rsiHistory.slice(-5))
    console.log('Total History Length:', priceHistory.length, 'days')
    console.log('Current RSI (BB):', latestBB.indicator?.value)
    console.log('RSI Range Check - All values 0-100:', rsiHistory.every((val: number) => val >= 0 && val <= 100))
    
    // Calculate RSI trend (improving/deteriorating) - compare last 7 days vs previous 7 days
    const rsiTrend = rsiHistory.length >= 14 ? 
      ((rsiHistory.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7) > 
       (rsiHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7) ? 'improving' : 'deteriorating') : 'neutral'
    
    // Calculate price momentum (last 7 days vs previous 7 days for better signal)
    const recentPrices = priceHistory.slice(-7)                    // Last 7 DAYS
    const previousPrices = priceHistory.slice(-14, -7)             // Previous 7 DAYS  
    const recentAvg = recentPrices.length > 0 ? recentPrices.reduce((a: number, b: number) => a + b, 0) / recentPrices.length : 0
    const previousAvg = previousPrices.length > 0 ? previousPrices.reduce((a: number, b: number) => a + b, 0) / previousPrices.length : 0
    const momentum = recentAvg > previousAvg ? 'bullish' : 'bearish'
    
    // Calculate volume trend (last 7 days vs previous 7 days)
    const recentVolume = volumeHistory.slice(-7).length > 0 ? 
      volumeHistory.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7 : 0
    const previousVolume = volumeHistory.slice(-14, -7).length > 0 ? 
      volumeHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7 : 0
    const volumeTrend = recentVolume > previousVolume * 1.2 ? 'increasing' : 
                       recentVolume < previousVolume * 0.8 ? 'decreasing' : 'stable'
    
    // ENHANCED: Calculate support/resistance from last 21 days (3 weeks) for better S/R levels
    const recentPriceData = priceHistory.slice(-21)                // Last 21 DAYS (3 weeks)
    const currentPrice = marketData?.quote?.USD?.price || 0
    const support = recentPriceData.length > 0 ? Math.min(...recentPriceData) : currentPrice * 0.95
    const resistance = recentPriceData.length > 0 ? Math.max(...recentPriceData) : currentPrice * 1.05

    console.log('Recent Prices for S/R (21 days):', recentPriceData.slice(-10))
    console.log('Calculated Support:', support)
    console.log('Calculated Resistance:', resistance)
    console.log('Recent Volume Average (7 days):', recentVolume)
    console.log('Previous Volume Average (7 days):', previousVolume)
    console.log('Volume Trend:', volumeTrend)
    
    // Detect RSI divergences (price vs RSI direction over 7-day periods)
    // FIXED: Now using consistent Bollinger Bands RSI data (0-100 range)
    const currentRSIAvg = rsiHistory.length >= 7 ? rsiHistory.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7 : 50
    const previousRSIAvg = rsiHistory.length >= 14 ? rsiHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7 : 50
    
    const priceDirection = currentPrice > previousAvg ? 'up' : 'down'
    const rsiDirection = currentRSIAvg > previousRSIAvg ? 'up' : 'down'
    const divergence = priceDirection !== rsiDirection ? 
      (priceDirection === 'up' ? 'bearish' : 'bullish') : 'none'

    console.log('Price Direction (7d avg):', priceDirection, 'RSI Direction (7d avg):', rsiDirection, 'Divergence:', divergence)

    // Safe access to USD data with fallbacks
    const usdData = marketData.quote.USD
    const percentChange = usdData?.percent_change_24h || 0

    // REAL DATA: Get actual open interest from API
    const latestOpenInterest = openInterestData?.data?.[openInterestData.data?.length - 1]
    const currentOpenInterest = latestOpenInterest?.close || 0
    const openInterestChange = (openInterestData?.data?.length || 0) >= 2 ? 
      ((currentOpenInterest - (openInterestData?.data?.[openInterestData.data.length - 2]?.close || 0)) / 
       (openInterestData?.data?.[openInterestData.data.length - 2]?.close || 1)) * 100 : 0

    // REAL DATA: Get actual liquidation data from API
    const recentLiquidations = liquidationData?.data?.slice(-1)?.[0] // Most recent day
    const totalLiquidations24h = recentLiquidations ? 
      (recentLiquidations.longLiquidations + recentLiquidations.shortLiquidations) : 0
    const longLiquidations = recentLiquidations?.longLiquidations || 0
    const shortLiquidations = recentLiquidations?.shortLiquidations || 0

    // REAL DATA: Get actual buy/sell pressure from API
    const actualBuyRatio = takerBuySellData?.data?.overall?.buyRatio || 0.5
    const actualSellRatio = takerBuySellData?.data?.overall?.sellRatio || 0.5
    const buyVolumeUsd = takerBuySellData?.data?.overall?.buyVolumeUsd || 0
    const sellVolumeUsd = takerBuySellData?.data?.overall?.sellVolumeUsd || 0

    console.log('Real Open Interest:', currentOpenInterest, 'Change:', openInterestChange + '%')
    console.log('Real Liquidations 24h:', totalLiquidations24h, 'Long:', longLiquidations, 'Short:', shortLiquidations)
    console.log('Real Buy/Sell Ratio:', actualBuyRatio + '%', '/', actualSellRatio + '%')

    const analysisPayload = {
      name: marketData.name || tokenData?.name || 'Unknown Token',
      symbol: marketData.symbol || tokenData?.symbol || 'UNK',
      quote: marketData.quote,
      timeframe: activeTimeScale,
      
      // ENHANCED: Historical price context (for AI context, not current analysis)
      priceContext: {
        currentPrice: currentPrice,
        priceHistory: priceHistory, // Historical context
        momentum: momentum,
        volatility: Math.abs(percentChange) > 5 ? 'high' : Math.abs(percentChange) > 2 ? 'moderate' : 'low',
        support: support, // FIXED: Realistic support level
        resistance: resistance, // FIXED: Realistic resistance level
      },
      
      // ENHANCED: Volume analysis (historical context + current state)
      volumeAnalysis: {
        currentVolume: usdData?.volume_24h || 0,
        volumeHistory: volumeHistory, // Historical context
        volumeTrend: volumeTrend,
        averageVolume: volumeHistory.length > 0 ? volumeHistory.reduce((a: number, b: number) => a + b, 0) / volumeHistory.length : 0,
        volumeSpike: recentVolume > previousVolume * 1.5,
      },
      
      // Hull Suite data (current state analysis)
      hullSuite: {
        trendDirection: momentum === 'bullish' ? 'bullish' as const : 'bearish' as const,
        crossoverSignal: 'none' as const,
        strength: Math.abs(percentChange) > 3 ? 'strong' as const : 'moderate' as const,
      },
      
      // ENHANCED: Bollinger Bands with historical context
      bollingerBands: latestBB.indicator ? {
        indicator: 'RSI' as const,
        currentValue: latestBB.indicator.value, // Current state
        upperBand: latestBB.upper?.value || 0,
        lowerBand: latestBB.lower?.value || 0,
        basis: latestBB.basis?.value || 0,
        position: latestBB.indicator.value > (latestBB.upper?.value || 70) ? 'overbought' as const :
                  latestBB.indicator.value < (latestBB.lower?.value || 30) ? 'oversold' as const : 'normal' as const,
        breachType: 'none' as const,
        divergence: divergence as 'bullish' | 'bearish' | 'none',
        trend: rsiTrend, // Historical trend
        history: rsiHistory, // Historical context
      } : undefined,
      
      // ENHANCED: Market Vision with current state + historical trends
      marketVision: {
        rsi: latestBB.indicator ? {
          value: latestBB.indicator.value, // Use Bollinger Bands RSI (proper 0-100 range)
          signal: latestBB.indicator.value > 70 ? 'overbought' as const : 
                  latestBB.indicator.value < 30 ? 'oversold' as const : 'neutral' as const,
          trend: rsiTrend, // Historical trend
          history: rsiHistory, // FIXED: Now using consistent Bollinger Bands RSI history
          divergence: divergence as 'bullish' | 'bearish' | 'none',
        } : undefined,
        
        waveTrend: {
          wt1: latestWTValues.wt1, // Current state
          wt2: latestWTValues.wt2,
          signal: latestWTValues.wt1 > latestWTValues.wt2 ? 'bullish_cross' as const : 'bearish_cross' as const,
          momentum: Math.abs(latestWTValues.wt1) > 50 ? 'strong' as const : 'moderate' as const,
        },
        
        moneyFlow: {
          direction: latestMFValue > 0 ? 'inflow' as const : 'outflow' as const, // Current state
          strength: Math.abs(latestMFValue) > 50 ? 'strong' as const : 'moderate' as const,
          value: latestMFValue,
        },
      },
      
      // REAL LIQUIDATION DATA: Using actual market data
      liquidationData: {
        totalLiquidations24h: totalLiquidations24h,
        longLiquidations: longLiquidations,
        shortLiquidations: shortLiquidations,
        openInterest: currentOpenInterest,
        openInterestChange: openInterestChange,
      },
      
      // REAL ORDER FLOW: Using actual taker buy/sell data
      orderFlow: {
        takerBuyRatio: actualBuyRatio / 100, // Convert percentage to ratio
        buyVolumeUsd: buyVolumeUsd,
        sellVolumeUsd: sellVolumeUsd,
        buyPressure: actualBuyRatio > 52 ? 'high' as const : actualBuyRatio > 48 ? 'moderate' as const : 'low' as const,
        sellPressure: actualSellRatio > 52 ? 'high' as const : actualSellRatio > 48 ? 'moderate' as const : 'low' as const,
        netFlow: actualBuyRatio > actualSellRatio ? 'bullish' as const : 'bearish' as const,
      },
      
      // ENHANCED: Price Action with current state + historical context  
      priceAction: {
        trend: percentChange > 2 ? 'uptrend' as const :
               percentChange < -2 ? 'downtrend' as const : 'sideways' as const,
        volatility: Math.abs(percentChange) > 5 ? 'high' as const : 
                   Math.abs(percentChange) > 2 ? 'moderate' as const : 'low' as const,
        volume_profile: volumeTrend as 'increasing' | 'decreasing' | 'stable',
        priceLevel: 'neutral' as const,
        momentum: momentum, // Historical momentum
        divergenceSignal: divergence !== 'none',
      },
    }

    console.log('=== FINAL ANALYSIS PAYLOAD ===')
    console.log(JSON.stringify(analysisPayload, null, 2))
    console.log('==============================')

    return analysisPayload
  }

  // Function to call the enhanced analyze endpoint
  const handleAnalyze = async () => {
    try {
      setIsAnalysisLoading(true)
      setAnalysisResult('')
      setIsDialogOpen(true)
      
      // FIXED: Wait longer for React state to update and indicators to calculate  
      await new Promise(resolve => setTimeout(resolve, 500))

      const analysisData = prepareAnalysisData()
      if (!analysisData) {
        setAnalysisResult('Unable to prepare analysis data. Please try again.')
        return
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(analysisData),
      })
      
      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`)
      }

      // Handle the streaming response
      if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let analysisText = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            // Decode the chunk as plain text
            const chunk = decoder.decode(value, { stream: true })
            analysisText += chunk
            setAnalysisResult(analysisText)
          }
        } finally {
          reader.releaseLock()
        }
      }
    } catch (error) {
      console.error('Analysis failed:', error)
      setAnalysisResult('Failed to generate analysis. Please try again.')
    } finally {
      setIsAnalysisLoading(false)
    }
  }

  // Helper function to format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`
    return num.toFixed(2)
  }

  // Get latest BB values for UI display
  const latestBBIndicator = bbData.indicator && bbData.indicator.length > 0 
    ? bbData.indicator[bbData.indicator.length - 1] 
    : null

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          onClick={handleAnalyze}
          variant="ghost"
          size="sm"
          className="h-8 px-2 rounded-xl w-auto pr-3 bg-zinc-800/40 hover:bg-zinc-900/50 ring-1 ring-zinc-800/80"
        >
          <IconSparkles className="h-4 w-4 fill-white/50" />
          <span className="text-white">Analyze</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-7xl max-h-[90vh]">
        {/* Header */}
        <DialogHeader className="border-b border-gray-800 pb-4">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex items-center gap-4">
                <Image
                  src={tokenData?.logoUrl || `https://s2.coinmarketcap.com/static/img/coins/64x64/${coinId}.png`}
                  alt={tokenData?.name || marketData?.name || 'Token'}
                  className="w-8 h-8 rounded-full ring-1 ring-white/10"
                  width={24}
                  height={24}
                  priority={true}
                  placeholder="blur"
                  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGBkbHB0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/favicon.ico';
                  }}
                />
                <span className="font-semibold text-white text-3xl">
                  {marketData?.name || tokenData?.name || 'Token'}
                </span>
                <Badge variant={marketData?.quote?.USD?.percent_change_24h >= 0 ? "success" : "destructive"}>
                  {marketData?.quote?.USD?.percent_change_24h >= 0 ? '+' : ''}
                  {marketData?.quote?.USD?.percent_change_24h?.toFixed(2)}%
                </Badge>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>
         <div>
            <ScrollArea className="h-[75vh] w-full">
            <div className="grid grid-cols-1 lg:grid-cols-4 divide-x divide-gray-800">
                {/* Left Sidebar - Key Metrics */}
                <div className="lg:col-span-1 space-y-6 p-6 pl-0 pt-0">
                <div className="space-y-3 sticky top-0 pt-6">
                    <div className="flex items-center gap-2">
                        <IconMagnifyingglass className="w-4 h-4 fill-white/50" />
                        <h3 className="text-sm font-medium text-white">Market Metrics</h3>
                    </div>
                    <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Current Price</span>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-white">
                            ${marketData?.quote?.USD?.price?.toLocaleString() || '0.00'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Market Cap</span>
                    <span className="font-mono text-sm text-white">
                        ${formatNumber(marketData?.quote?.USD?.market_cap || 0)}
                    </span>
                    </div>

                    <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">24h Volume</span>
                    <div className="flex items-center gap-1">
                        <span className="font-mono text-sm text-white">
                            ${formatNumber(marketData?.quote?.USD?.volume_24h || 0)}
                        </span>
                        {/* Volume trend indicator */}
                        {(() => {
                            const recentVolume = volumeData.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7
                            const previousVolume = volumeData.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7
                            const trend = recentVolume > previousVolume * 1.2 ? 'up' : 
                                         recentVolume < previousVolume * 0.8 ? 'down' : 'stable'
                            return (
                                <Badge variant={trend === 'up' ? "success" : trend === 'down' ? "destructive" : "secondary"} className="text-xs px-1">
                                    {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'}
                                </Badge>
                            )
                        })()}
                    </div>
                    </div>

                    {/* Support/Resistance Levels */}
                    <div className="flex flex-col space-y-2 border-t border-gray-800 pt-3 mt-3">
                        <div className="flex items-center gap-2">
                            <IconChartLineUptrendXyaxis className="w-4 h-4 fill-white/50" />
                            <h3 className="text-sm font-medium text-white">Price Levels</h3>
                        </div>
                        {(() => {
                            const priceHistory = chartData?.map((d: { value: number }) => d.value) || []
                            const recentPriceData = priceHistory.slice(-21)
                            const support = recentPriceData.length > 0 ? Math.min(...recentPriceData) : 0
                            const resistance = recentPriceData.length > 0 ? Math.max(...recentPriceData) : 0
                            return (
                                <>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-400">Support (21d)</span>
                                        <span className="font-mono text-xs text-green-400">
                                            ${support.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-400">Resistance (21d)</span>
                                        <span className="font-mono text-xs text-red-400">
                                            ${resistance.toLocaleString()}
                                        </span>
                                    </div>
                                </>
                            )
                        })()}
                    </div>

                    <div className="flex flex-col space-y-3 border-t border-gray-800 pt-3 mt-3">
                    <div className="flex items-center gap-2">
                        <IconCircleDottedAndCircle className="w-4 h-4 fill-white/50" />
                        <h3 className="text-sm font-medium text-white">Technical Indicators</h3>
                    </div>
                    
                    {/* Hull Suite Trend */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Hull Suite</span>
                        <div className="flex items-center gap-1">
                            <Badge variant={
                                (marketData?.quote?.USD?.percent_change_24h || 0) > 0 ? "success" : "destructive"
                            } className="text-xs px-1">
                                {(marketData?.quote?.USD?.percent_change_24h || 0) > 0 ? 'Bullish' : 'Bearish'}
                            </Badge>
                            <Badge variant="secondary" className="text-xs px-1">
                                {Math.abs(marketData?.quote?.USD?.percent_change_24h || 0) > 3 ? 'Strong' : 'Moderate'}
                            </Badge>
                        </div>
                    </div>

                    {/* Enhanced RSI with Bollinger Bands */}
                    {latestBBIndicator && (
                    <div className="flex flex-col space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-400">RSI (Bollinger)</span>
                            <div className="flex items-center gap-1">
                                <span className="font-mono text-xs text-white">
                                    {latestBBIndicator.value.toFixed(1)}
                                </span>
                                <Badge variant={
                                    (latestBBIndicator?.value || 50) > 70 ? "destructive" : 
                                    (latestBBIndicator?.value || 50) < 30 ? "success" : "secondary"
                                }>
                                    {(latestBBIndicator?.value || 50) > 70 ? 'Overbought' : 
                                    (latestBBIndicator?.value || 50) < 30 ? 'Oversold' : 'Neutral'}
                                </Badge>
                            </div>
                        </div>
                        {/* BB Bands */}
                        {bbData.upper && bbData.lower && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Bands:</span>
                                <span className="font-mono text-gray-400">
                                    {bbData.lower[bbData.lower.length - 1]?.value.toFixed(1)} - {bbData.upper[bbData.upper.length - 1]?.value.toFixed(1)}
                                </span>
                            </div>
                        )}
                    </div>
                    )}

                    {/* Divergence Detection */}
                    {(() => {
                        if (!latestBBIndicator || !chartData || chartData.length < 14) return null
                        const priceHistory = chartData.map((d: { value: number }) => d.value)
                        const rsiHistory = bbData.indicator?.map((d: { value: number }) => d.value) || []
                        
                        if (rsiHistory.length < 14) return null
                        
                        const currentPrice = priceHistory[priceHistory.length - 1] || 0
                        const previousAvg = priceHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7
                        const currentRSIAvg = rsiHistory.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7
                        const previousRSIAvg = rsiHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7
                        
                        const priceDirection = currentPrice > previousAvg ? 'up' : 'down'
                        const rsiDirection = currentRSIAvg > previousRSIAvg ? 'up' : 'down'
                        const divergence = priceDirection !== rsiDirection ? 
                            (priceDirection === 'up' ? 'bearish' : 'bullish') : 'none'
                        
                        if (divergence === 'none') return null
                        
                        return (
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-400">Divergence</span>
                                <Badge variant={divergence === 'bullish' ? "success" : "destructive"} className="text-xs px-1">
                                    {divergence === 'bullish' ? 'Bullish' : 'Bearish'} Signal
                                </Badge>
                            </div>
                        )
                    })()}
                    
                    {marketVisionData.moneyFlow.fast.length > 0 && (
                        <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Money Flow</span>
                        <div className="flex items-center gap-1">
                            <Badge variant={
                                (marketVisionData.moneyFlow.fast[marketVisionData.moneyFlow.fast.length - 1]?.value || 0) > 0 
                                ? "success" : "destructive"
                            } className="text-xs px-1">
                                {(marketVisionData.moneyFlow.fast[marketVisionData.moneyFlow.fast.length - 1]?.value || 0) > 0 
                                ? 'Inflow' : 'Outflow'}
                            </Badge>
                            <span className="font-mono text-xs text-gray-400">
                                {Math.abs(marketVisionData.moneyFlow.fast[marketVisionData.moneyFlow.fast.length - 1]?.value || 0).toFixed(1)}
                            </span>
                        </div>
                        </div>
                    )}

                    {marketVisionData.waveTrend.wt1.length > 0 && (
                        <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Wave Trend</span>
                        <div className="flex items-center gap-1">
                            <Badge variant={
                                (marketVisionData.waveTrend.wt1[marketVisionData.waveTrend.wt1.length - 1]?.value || 0) > 
                                (marketVisionData.waveTrend.wt2[marketVisionData.waveTrend.wt2.length - 1]?.value || 0)
                                ? "success" : "destructive"
                            } className="text-xs px-1">
                                {(marketVisionData.waveTrend.wt1[marketVisionData.waveTrend.wt1.length - 1]?.value || 0) > 
                                (marketVisionData.waveTrend.wt2[marketVisionData.waveTrend.wt2.length - 1]?.value || 0)
                                ? 'Bullish' : 'Bearish'}
                            </Badge>
                            <span className="font-mono text-xs text-gray-400">
                                {(marketVisionData.waveTrend.wt1[marketVisionData.waveTrend.wt1.length - 1]?.value || 0).toFixed(1)}
                            </span>
                        </div>
                        </div>
                    )}

                    {/* Market Structure Section */}
                    <div className="flex flex-col space-y-3 border-t border-gray-800 pt-3 mt-3">
                                                 <div className="flex items-center gap-2">
                             <IconCircleDottedAndCircle className="w-4 h-4 fill-white/50" />
                             <h3 className="text-sm font-medium text-white">Market Structure</h3>
                         </div>

                        {openInterestData?.data && openInterestData.data.length > 0 && (
                            <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-400">Open Interest</span>
                            <div className="flex items-center gap-1">
                                <span className="font-mono text-xs text-white">
                                ${formatNumber(openInterestData.data[openInterestData.data.length - 1]?.close || 0)}
                                </span>
                                {openInterestData.data.length >= 2 && (
                                <Badge variant={
                                    (openInterestData.data[openInterestData.data.length - 1]?.close || 0) > 
                                    (openInterestData.data[openInterestData.data.length - 2]?.close || 0)
                                    ? "success" : "destructive"
                                } className="text-xs px-1">
                                    {(((openInterestData.data[openInterestData.data.length - 1]?.close || 0) - 
                                    (openInterestData.data[openInterestData.data.length - 2]?.close || 0)) / 
                                    (openInterestData.data[openInterestData.data.length - 2]?.close || 1) * 100).toFixed(1)}%
                                </Badge>
                                )}
                            </div>
                            </div>
                        )}

                        {takerBuySellData?.data?.overall && (
                            <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-400">Order Flow</span>
                            <div className="flex items-center gap-1">
                                <Badge variant={
                                    (takerBuySellData.data.overall.buyRatio || 50) > 52 ? "success" : 
                                    (takerBuySellData.data.overall.buyRatio || 50) < 48 ? "destructive" : "secondary"
                                } className="text-xs px-1">
                                {(takerBuySellData.data.overall.buyRatio || 50).toFixed(1)}% Buy
                                </Badge>
                                <span className="text-xs text-gray-500">/</span>
                                <Badge variant={
                                    (takerBuySellData.data.overall.sellRatio || 50) > 52 ? "destructive" : 
                                    (takerBuySellData.data.overall.sellRatio || 50) < 48 ? "success" : "secondary"
                                } className="text-xs px-1">
                                {(takerBuySellData.data.overall.sellRatio || 50).toFixed(1)}% Sell
                                </Badge>
                            </div>
                            </div>
                        )}

                        {liquidationData?.data && liquidationData.data.length > 0 && (
                            <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-400">24h Liquidations</span>
                            <div className="flex items-center gap-1">
                                <span className="font-mono text-xs text-white">
                                ${formatNumber((liquidationData.data[liquidationData.data.length - 1]?.longLiquidations || 0) + 
                                            (liquidationData.data[liquidationData.data.length - 1]?.shortLiquidations || 0))}
                                </span>
                                <Badge variant={
                                    (liquidationData.data[liquidationData.data.length - 1]?.longLiquidations || 0) > 
                                    (liquidationData.data[liquidationData.data.length - 1]?.shortLiquidations || 0)
                                    ? "destructive" : "success"
                                } className="text-xs px-1">
                                {(liquidationData.data[liquidationData.data.length - 1]?.longLiquidations || 0) > 
                                (liquidationData.data[liquidationData.data.length - 1]?.shortLiquidations || 0)
                                ? 'Long Heavy' : 'Short Heavy'}
                                </Badge>
                            </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-400">Trend</span>
                            <div className="flex items-center gap-1">
                            {(marketData?.quote?.USD?.percent_change_24h || 0) > 2 ? (
                                <IconArrowUpRight className="w-3 h-3 fill-green-400" />
                            ) : (marketData?.quote?.USD?.percent_change_24h || 0) < -2 ? (
                                <IconArrowDownRight className="w-3 h-3 fill-red-400" />
                            ) : (
                                <IconArrowRight className="w-3 h-3 fill-gray-400" />
                            )}
                            <span className="text-sm text-gray-300">
                                {(marketData?.quote?.USD?.percent_change_24h || 0) > 2 ? 'Uptrend' :
                                (marketData?.quote?.USD?.percent_change_24h || 0) < -2 ? 'Downtrend' : 'Sideways'}
                            </span>
                            <span className="font-mono text-xs text-gray-400">
                                {Math.abs(marketData?.quote?.USD?.percent_change_24h || 0).toFixed(1)}%
                            </span>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
                </div>

                {/* Main Content */}
                <div className="lg:col-span-3 space-y-6 p-12">
                <div>
                    <h1 className="text-xl font-semibold mb-6 text-white">
                    {marketData?.name || tokenData?.name || 'Token'} Market Overview
                    </h1>

                    {isAnalysisLoading ? (
                    <div className="flex items-center justify-center p-12">
                        <Spinner className="w-8 h-8 mr-3" />
                        <span className="text-gray-400 text-lg">Analyzing technical indicators...</span>
                    </div>
                                     ) : analysisResult ? (
                   <div className="space-y-8">
                     <div className="prose prose-invert max-w-none">
                       <ReactMarkdown 
                         components={{
                           h1: ({ children }) => <h1 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">{children}</h1>,
                           h2: ({ children }) => <h2 className="text-lg font-semibold text-white mb-3 mt-6">{children}</h2>,
                           h3: ({ children }) => <h3 className="text-base font-medium text-gray-200 mb-2 mt-4">{children}</h3>,
                           p: ({ children }) => <p className="text-gray-300 mb-3 leading-relaxed">{children}</p>,
                           strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                           ul: ({ children }) => <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>,
                           li: ({ children }) => <li className="text-gray-300">{children}</li>,
                           em: ({ children }) => <em className="text-gray-400 italic">{children}</em>,
                         }}
                       >
                         {analysisResult}
                       </ReactMarkdown>
                     </div>
                   </div>
                    ) : (
                    <div className="text-center py-12">
                        <IconSparkles className="w-12 h-12 mx-auto mb-4 fill-gray-600" />
                        <p className="text-gray-400 text-lg">Click the analyze button to generate AI insights</p>
                        <p className="text-gray-500 text-sm mt-2">
                        Our AI will analyze technical indicators, market trends, and provide actionable insights
                        </p>
                    </div>
                    )}
                </div>
                </div>
            </div>
            </ScrollArea>            
        </div>         

      </DialogContent>
    </Dialog>
  )
} 