import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useChartData } from '@/hooks/use-chart-data'
import { useMarketVisionB, calculateBollingerBands } from '@/hooks/market-vision'
import { useOpenInterest } from '@/hooks/use-open-interest'
import { useLiquidationHistory } from '@/hooks/use-liquidation-history'
import { useTakerBuySell } from '@/hooks/use-taker-buy-sell'
import type { Time } from 'lightweight-charts'

interface UseAnalysisDataProps {
  coinId: string
  tokenData: {
    name?: string
    symbol?: string
    id?: string
    logoUrl?: string
  } | null
  shouldCalculate: boolean
}

export function useAnalysisData({ coinId, tokenData, shouldCalculate }: UseAnalysisDataProps) {
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState('')
  
  const activeTimeScale = '30d'
  const EMPTY_ARRAY = useMemo(() => [], [])

  // Fetch market data from CMC
  const { data: marketData } = useQuery({
    queryKey: ['coinMarketData', coinId],
    queryFn: async () => {
      const response = await fetch(`/api/coinmarketcap/quotes?ids=${coinId}`)
      if (!response.ok) throw new Error('Failed to fetch market data')
      const data = await response.json()
      return data.data[coinId]
    },
    staleTime: 30 * 1000,
  })

  // Safe fallback for market data
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

  // Calculate OHLCV data when needed
  const ohlcvData = useMemo(() => {
    if (!shouldCalculate || !chartData.length || !volumeData.length) {
      return EMPTY_ARRAY
    }

    return chartData.map((point: { time: Time; value: number }, index: number) => {
      const price = point.value
      const volume = volumeData[index]?.value || 0
      const prevPrice = index > 0 ? chartData[index - 1]?.value || price : price
      
      const priceChange = price - prevPrice
      const volatility = Math.abs(priceChange) * 0.3 + price * 0.001
      
      const open = prevPrice
      const close = price
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
  }, [shouldCalculate, chartData, volumeData, EMPTY_ARRAY])

  // Memoized Bollinger config
  const bollingerConfig = useMemo(() => ({
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

  // Calculate indicators
  const marketVisionData = useMarketVisionB(shouldCalculate ? ohlcvData : EMPTY_ARRAY)
  
  const bbData = useMemo(() => {
    if (!shouldCalculate) {
      return { indicator: [], upper: [], lower: [], basis: [] }
    }
    return calculateBollingerBands(ohlcvData, bollingerConfig)
  }, [shouldCalculate, ohlcvData, bollingerConfig])

  // Fetch real market data
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
    limit: 7,
  })

  const { data: takerBuySellData } = useTakerBuySell({
    symbol: coinId,
    range: '24h',
  })

  // Prepare analysis data
  const prepareAnalysisData = () => {
    if (!marketData?.quote?.USD) return null

    // Force calculate OHLCV data if not available
    let analysisOhlcvData = ohlcvData
    if (ohlcvData.length === 0 && chartData.length > 0 && volumeData.length > 0) {
      analysisOhlcvData = chartData.map((point: { time: Time; value: number }, index: number) => {
        const price = point.value
        const volume = volumeData[index]?.value || 0
        const prevPrice = index > 0 ? chartData[index - 1]?.value || price : price
        
        const priceChange = price - prevPrice
        const spread = Math.abs(priceChange) * 0.01
        
        return {
          time: point.time,
          open: prevPrice,
          high: Math.max(prevPrice, price) + spread,
          low: Math.min(prevPrice, price) - spread,
          close: price,
          volume: volume
        }
      })
    }

    // Force calculate Bollinger Bands if not available
    let analysisBBData = bbData
    if (bbData.indicator.length === 0 && analysisOhlcvData.length > 0) {
      analysisBBData = calculateBollingerBands(analysisOhlcvData, bollingerConfig)
    }

    // Get latest values
    const latestBB = {
      indicator: analysisBBData.indicator[analysisBBData.indicator.length - 1],
      upper: analysisBBData.upper[analysisBBData.upper.length - 1],
      lower: analysisBBData.lower[analysisBBData.lower.length - 1],
      basis: analysisBBData.basis[analysisBBData.basis.length - 1]
    }
    
    const latestWT = marketVisionData.waveTrend
    const latestWTValues = {
      wt1: latestWT.wt1[latestWT.wt1.length - 1]?.value || 0,
      wt2: latestWT.wt2[latestWT.wt2.length - 1]?.value || 0
    }
    
    const latestMF = marketVisionData.moneyFlow
    const latestMFValue = latestMF.fast[latestMF.fast.length - 1]?.value || 0

    // Calculate historical trends
    const bollingerHistory = analysisBBData.indicator.slice(-30).map((item: { value: number }) => item?.value).filter((value: number | undefined): value is number => typeof value === 'number' && value >= 0 && value <= 100)
    const rsiHistory = bollingerHistory.length > 0 ? bollingerHistory : []
    
    const priceHistory = chartData.slice(-30).map((item: { value: number }) => item.value).filter((value: number | undefined): value is number => typeof value === 'number')
    const volumeHistory = volumeData.slice(-30).map((item: { value: number }) => item.value).filter((value: number | undefined): value is number => typeof value === 'number')

    // Calculate trends
    const rsiTrend = rsiHistory.length >= 14 ? 
      ((rsiHistory.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7) > 
       (rsiHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7) ? 'improving' : 'deteriorating') : 'neutral'
    
    const recentPrices = priceHistory.slice(-7)
    const previousPrices = priceHistory.slice(-14, -7)
    const recentAvg = recentPrices.length > 0 ? recentPrices.reduce((a: number, b: number) => a + b, 0) / recentPrices.length : 0
    const previousAvg = previousPrices.length > 0 ? previousPrices.reduce((a: number, b: number) => a + b, 0) / previousPrices.length : 0
    const momentum = recentAvg > previousAvg ? 'bullish' : 'bearish'
    
    const recentVolume = volumeHistory.slice(-7).length > 0 ? 
      volumeHistory.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7 : 0
    const previousVolume = volumeHistory.slice(-14, -7).length > 0 ? 
      volumeHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7 : 0
    const volumeTrend = recentVolume > previousVolume * 1.2 ? 'increasing' : 
                       recentVolume < previousVolume * 0.8 ? 'decreasing' : 'stable'
    
    const recentPriceData = priceHistory.slice(-21)
    const currentPrice = marketData?.quote?.USD?.price || 0
    const support = recentPriceData.length > 0 ? Math.min(...recentPriceData) : currentPrice * 0.95
    const resistance = recentPriceData.length > 0 ? Math.max(...recentPriceData) : currentPrice * 1.05

    // Detect divergences
    const currentRSIAvg = rsiHistory.length >= 7 ? rsiHistory.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7 : 50
    const previousRSIAvg = rsiHistory.length >= 14 ? rsiHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) / 7 : 50
    
    const priceDirection = currentPrice > previousAvg ? 'up' : 'down'
    const rsiDirection = currentRSIAvg > previousRSIAvg ? 'up' : 'down'
    const divergence = priceDirection !== rsiDirection ? 
      (priceDirection === 'up' ? 'bearish' : 'bullish') : 'none'

    const usdData = marketData.quote.USD
    const percentChange = usdData?.percent_change_24h || 0

    // Get real market data
    const latestOpenInterest = openInterestData?.data?.[openInterestData.data?.length - 1]
    const currentOpenInterest = latestOpenInterest?.close || 0
    const openInterestChange = (openInterestData?.data?.length || 0) >= 2 ? 
      ((currentOpenInterest - (openInterestData?.data?.[openInterestData.data.length - 2]?.close || 0)) / 
       (openInterestData?.data?.[openInterestData.data.length - 2]?.close || 1)) * 100 : 0

    const recentLiquidations = liquidationData?.data?.slice(-1)?.[0]
    const totalLiquidations24h = recentLiquidations ? 
      (recentLiquidations.longLiquidations + recentLiquidations.shortLiquidations) : 0
    const longLiquidations = recentLiquidations?.longLiquidations || 0
    const shortLiquidations = recentLiquidations?.shortLiquidations || 0

    const actualBuyRatio = takerBuySellData?.data?.overall?.buyRatio || 0.5
    const actualSellRatio = takerBuySellData?.data?.overall?.sellRatio || 0.5
    const buyVolumeUsd = takerBuySellData?.data?.overall?.buyVolumeUsd || 0
    const sellVolumeUsd = takerBuySellData?.data?.overall?.sellVolumeUsd || 0

    return {
      name: marketData.name || tokenData?.name || 'Unknown Token',
      symbol: marketData.symbol || tokenData?.symbol || 'UNK',
      quote: marketData.quote,
      timeframe: activeTimeScale,
      
      priceContext: {
        currentPrice: currentPrice,
        priceHistory: priceHistory,
        momentum: momentum,
        volatility: Math.abs(percentChange) > 5 ? 'high' : Math.abs(percentChange) > 2 ? 'moderate' : 'low',
        support: support,
        resistance: resistance,
      },
      
      volumeAnalysis: {
        currentVolume: usdData?.volume_24h || 0,
        volumeHistory: volumeHistory,
        volumeTrend: volumeTrend,
        averageVolume: volumeHistory.length > 0 ? volumeHistory.reduce((a: number, b: number) => a + b, 0) / volumeHistory.length : 0,
        volumeSpike: recentVolume > previousVolume * 1.5,
      },
      
      hullSuite: {
        trendDirection: momentum === 'bullish' ? 'bullish' as const : 'bearish' as const,
        crossoverSignal: 'none' as const,
        strength: Math.abs(percentChange) > 3 ? 'strong' as const : 'moderate' as const,
      },
      
      bollingerBands: latestBB.indicator ? {
        indicator: 'RSI' as const,
        currentValue: latestBB.indicator.value,
        upperBand: latestBB.upper?.value || 0,
        lowerBand: latestBB.lower?.value || 0,
        basis: latestBB.basis?.value || 0,
        position: latestBB.indicator.value > (latestBB.upper?.value || 70) ? 'overbought' as const :
                  latestBB.indicator.value < (latestBB.lower?.value || 30) ? 'oversold' as const : 'normal' as const,
        breachType: 'none' as const,
        divergence: divergence as 'bullish' | 'bearish' | 'none',
        trend: rsiTrend,
        history: rsiHistory,
      } : undefined,
      
      marketVision: {
        rsi: latestBB.indicator ? {
          value: latestBB.indicator.value,
          signal: latestBB.indicator.value > 70 ? 'overbought' as const : 
                  latestBB.indicator.value < 30 ? 'oversold' as const : 'neutral' as const,
          trend: rsiTrend,
          history: rsiHistory,
          divergence: divergence as 'bullish' | 'bearish' | 'none',
        } : undefined,
        
        waveTrend: {
          wt1: latestWTValues.wt1,
          wt2: latestWTValues.wt2,
          signal: latestWTValues.wt1 > latestWTValues.wt2 ? 'bullish_cross' as const : 'bearish_cross' as const,
          momentum: Math.abs(latestWTValues.wt1) > 50 ? 'strong' as const : 'moderate' as const,
        },
        
        moneyFlow: {
          direction: latestMFValue > 0 ? 'inflow' as const : 'outflow' as const,
          strength: Math.abs(latestMFValue) > 50 ? 'strong' as const : 'moderate' as const,
          value: latestMFValue,
        },
      },
      
      liquidationData: {
        totalLiquidations24h: totalLiquidations24h,
        longLiquidations: longLiquidations,
        shortLiquidations: shortLiquidations,
        openInterest: currentOpenInterest,
        openInterestChange: openInterestChange,
      },
      
      orderFlow: {
        takerBuyRatio: actualBuyRatio / 100,
        buyVolumeUsd: buyVolumeUsd,
        sellVolumeUsd: sellVolumeUsd,
        buyPressure: actualBuyRatio > 52 ? 'high' as const : actualBuyRatio > 48 ? 'moderate' as const : 'low' as const,
        sellPressure: actualSellRatio > 52 ? 'high' as const : actualSellRatio > 48 ? 'moderate' as const : 'low' as const,
        netFlow: actualBuyRatio > actualSellRatio ? 'bullish' as const : 'bearish' as const,
      },
      
      priceAction: {
        trend: percentChange > 2 ? 'uptrend' as const :
               percentChange < -2 ? 'downtrend' as const : 'sideways' as const,
        volatility: Math.abs(percentChange) > 5 ? 'high' as const : 
                   Math.abs(percentChange) > 2 ? 'moderate' as const : 'low' as const,
        volume_profile: volumeTrend as 'increasing' | 'decreasing' | 'stable',
        priceLevel: 'neutral' as const,
        momentum: momentum,
        divergenceSignal: divergence !== 'none',
      },
    }
  }

  // Handle analysis API call
  const handleAnalyze = async () => {
    try {
      setIsAnalysisLoading(true)
      setAnalysisResult('')
      
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

      if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let analysisText = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

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

  return {
    marketData,
    chartData,
    volumeData,
    bbData,
    marketVisionData,
    openInterestData,
    liquidationData,
    takerBuySellData,
    isAnalysisLoading,
    analysisResult,
    handleAnalyze,
    prepareAnalysisData,
  }
} 