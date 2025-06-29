'use client'

import React, { useState } from 'react'
import { Button } from "@v1/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@v1/ui/dialog"
import { ScrollArea } from "@v1/ui/scroll-area"
import { Spinner } from "@v1/ui/spinner"
import { IconSparkles } from 'symbols-react'
import { useQuery } from '@tanstack/react-query'
import { useChartData } from '@/hooks/use-chart-data'
import { useMarketVisionB } from '@/hooks/market-vision'
import { calculateBollingerBands } from '@/hooks/market-vision/bollinger-bands'
import { marketVisionConfig } from '@/hooks/market-vision/market-vision-config'
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
      <DialogContent className="max-w-4xl max-h-[80vh] bg-zinc-950/95 backdrop-blur-xl border border-zinc-800/30">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <IconSparkles className="w-5 h-5" />
            AI Technical Analysis - {marketData?.name || tokenData?.name || 'Token'}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] w-full">
          <div className="p-4">
            {isAnalysisLoading ? (
              <div className="flex items-center justify-center p-8">
                <Spinner className="w-6 h-6 mr-2" />
                <span className="text-muted-foreground">Analyzing technical indicators...</span>
              </div>
            ) : (
              <div className="prose prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono">
                  {analysisResult || 'Click the analysis button to generate insights'}
                </pre>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
} 