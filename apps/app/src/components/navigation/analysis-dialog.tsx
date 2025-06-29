'use client'

import React, { useState } from 'react'
import { Button } from "@v1/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@v1/ui/dialog"
import { ScrollArea } from "@v1/ui/scroll-area"
import { Spinner } from "@v1/ui/spinner"
import { Badge } from "@v1/ui/badge"
import { IconArrowDownRight, IconArrowRight, IconArrowUpRight, IconCircleDottedAndCircle, IconMagnifyingglass, IconSparkles } from 'symbols-react'
import { useQuery } from '@tanstack/react-query'
import { useChartData } from '@/hooks/use-chart-data'
import { useMarketVisionB } from '@/hooks/market-vision'
import { calculateBollingerBands } from '@/hooks/market-vision/bollinger-bands'
import { marketVisionConfig } from '@/hooks/market-vision/market-vision-config'
import type { Time } from 'lightweight-charts'
import Image from "next/image"

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
  const [analysisResult, setAnalysisResult] = useState<string>('')
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [activeTimeScale] = useState<string>("30d") // Default timeframe for analysis

  // Get market data using the coin ID
  const { data: marketData } = useQuery({
    queryKey: ['coin-market-data', coinId],
    queryFn: async () => {
      const response = await fetch(`/api/coinmarketcap/quotes?ids=${coinId}`)
      if (!response.ok) throw new Error('Failed to fetch market data')
      const data = await response.json()
      return data.data?.[coinId] || null
    },
    enabled: !!coinId,
    staleTime: 30 * 1000, // 30 seconds
  })

  // Get chart data for indicators using market data
  const usdQuoteData = {
    price: marketData?.quote?.USD?.price || 0,
    volume_24h: marketData?.quote?.USD?.volume_24h || 0,
    market_cap: marketData?.quote?.USD?.market_cap || 0,
    percent_change_24h: marketData?.quote?.USD?.percent_change_24h || 0
  }
  const { chartData, volumeData } = useChartData(coinId, activeTimeScale, usdQuoteData)

  // Convert price/volume data to OHLCV format for indicators
  const ohlcvData = React.useMemo(() => {
    if (!chartData.length) return []

    return chartData.map((point: { time: Time; value: number }, index: number) => {
      const price = point.value
      const volume = volumeData[index]?.value || 0
      const prevPrice = index > 0 ? chartData[index - 1]?.value || price : price
      
      // Create realistic OHLC with price movement patterns
      const priceChange = price - prevPrice
      const volatility = Math.abs(priceChange) * 0.5 + price * 0.001
      
      const open = prevPrice
      const close = price
      const high = Math.max(open, close) + volatility * Math.random()
      const low = Math.min(open, close) - volatility * Math.random()
      
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

  // Calculate indicators for analysis
  const marketVisionData = useMarketVisionB(ohlcvData, marketVisionConfig)
  const bollingerBandsData = calculateBollingerBands(ohlcvData, {
    drawRSI: true,
    drawMFI: false,
    highlightBreaches: true,
    length: 14,
    source: 'hlc3',
    bbLength: 20,
    multiplier: 2.0,
    lineWidth: 2,
    fillOpacity: 0.1
  })

  // Function to prepare comprehensive analysis data
  const prepareAnalysisData = () => {
    if (!marketData?.quote?.USD) return null

    // Get latest values from indicators
    const latestRSI = marketVisionData.oscillator1[marketVisionData.oscillator1.length - 1]
    const latestBB = {
      indicator: bollingerBandsData.indicator[bollingerBandsData.indicator.length - 1],
      upper: bollingerBandsData.upper[bollingerBandsData.upper.length - 1],
      lower: bollingerBandsData.lower[bollingerBandsData.lower.length - 1],
      basis: bollingerBandsData.basis[bollingerBandsData.basis.length - 1]
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

    // Safe access to USD data with fallbacks
    const usdData = marketData.quote.USD
    const percentChange = usdData?.percent_change_24h || 0

    return {
      name: marketData.name || tokenData?.name || 'Unknown Token',
      symbol: marketData.symbol || tokenData?.symbol || 'UNK',
      quote: marketData.quote,
      timeframe: activeTimeScale,
      
      // Hull Suite data (simplified for now)
      hullSuite: {
        trendDirection: 'neutral' as const,
        crossoverSignal: 'none' as const,
        strength: 'moderate' as const,
      },
      
      // Bollinger Bands
      bollingerBands: latestBB.indicator ? {
        indicator: 'RSI' as const,
        currentValue: latestBB.indicator.value,
        upperBand: latestBB.upper?.value || 0,
        lowerBand: latestBB.lower?.value || 0,
        basis: latestBB.basis?.value || 0,
        position: latestBB.indicator.value > (latestBB.upper?.value || 70) ? 'overbought' as const :
                  latestBB.indicator.value < (latestBB.lower?.value || 30) ? 'oversold' as const : 'normal' as const,
        breachType: 'none' as const,
      } : undefined,
      
      // Market Vision
      marketVision: {
        rsi: latestRSI ? {
          value: latestRSI.value,
          signal: latestRSI.value > 70 ? 'overbought' as const : 
                  latestRSI.value < 30 ? 'oversold' as const : 'neutral' as const,
        } : undefined,
        
        waveTrend: {
          wt1: latestWTValues.wt1,
          wt2: latestWTValues.wt2,
          signal: 'neutral' as const,
        },
        
        moneyFlow: {
          direction: latestMFValue > 0 ? 'inflow' as const : 'outflow' as const,
          strength: 'moderate' as const,
          value: latestMFValue,
        },
      },
      
      // Price Action
      priceAction: {
        trend: percentChange > 2 ? 'uptrend' as const :
               percentChange < -2 ? 'downtrend' as const : 'sideways' as const,
        volatility: Math.abs(percentChange) > 5 ? 'high' as const : 'moderate' as const,
        volume_profile: 'stable' as const,
      },
    }
  }

  // Function to call the enhanced analyze endpoint
  const handleAnalyze = async () => {
    try {
      setIsAnalysisLoading(true)
      setAnalysisResult('')
      setIsDialogOpen(true)

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

  // Get latest RSI value for display
  const latestRSI = marketVisionData.oscillator1[marketVisionData.oscillator1.length - 1]

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
                <Badge variant={marketData?.quote?.USD?.percent_change_24h >= 0 ? "default" : "destructive"}>
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
                    <span className="font-mono text-sm text-white">
                        ${formatNumber(marketData?.quote?.USD?.volume_24h || 0)}
                    </span>
                    </div>

                    <div className="flex flex-col space-y-3 border-t border-gray-800 pt-3 mt-3">
                    <div className="flex items-center gap-2">
                        <IconCircleDottedAndCircle className="w-4 h-4 fill-white/50" />
                        <h3 className="text-sm font-medium text-white">Technical Indicators</h3>
                    </div>
                    {latestRSI && (
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400 flex items-center gap-1">
                        Relative Strength
                        </span>
                        <div className="flex items-center gap-2">
                        <span className="font-mono text-white">{latestRSI.value.toFixed(1)}</span>
                        <Badge variant={
                            latestRSI.value > 70 ? "destructive" : 
                            latestRSI.value < 30 ? "default" : "secondary"
                        }>
                            {latestRSI.value > 70 ? 'Overbought' : 
                            latestRSI.value < 30 ? 'Oversold' : 'Neutral'}
                        </Badge>
                        </div>
                    </div>
                    )}
                    
                    {marketVisionData.moneyFlow.fast.length > 0 && (
                        <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">Money Flow</span>
                        <Badge variant={
                            (marketVisionData.moneyFlow.fast[marketVisionData.moneyFlow.fast.length - 1]?.value || 0) > 0 
                            ? "default" : "destructive"
                        }>
                            {(marketVisionData.moneyFlow.fast[marketVisionData.moneyFlow.fast.length - 1]?.value || 0) > 0 
                            ? 'Inflow' : 'Outflow'}
                        </Badge>
                        </div>
                    )}

                    <div className="flex items-center justify-between mb-2">
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
                        <pre className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">
                            {analysisResult}
                        </pre>
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