'use client'

import React from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
} from '@v1/ui/dialog'
import { Button } from '@v1/ui/button'

import { ScrollArea } from '@v1/ui/scroll-area'
import Image from 'next/image'
import { IconSparkles } from 'symbols-react'
import { useAnalysisData } from '@/hooks/use-analysis-data'
import { MarketMetricsSidebar } from './market-metrics-sidebar'
import { AnalysisResult } from './analysis-result'

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
  
  // Use the custom hook for all analysis data and logic
  const shouldCalculate = React.useMemo(() => isDialogOpen, [isDialogOpen])
  
  const {
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
  } = useAnalysisData({ coinId, tokenData, shouldCalculate })

  // Transform CoinGecko marketData to expected format for MarketMetricsSidebar
  const transformedMarketData = React.useMemo(() => {
    if (!marketData) return {}
    
    return {
      quote: {
        USD: {
          price: marketData.current_price || 0,
          market_cap: marketData.market_cap || 0,
          volume_24h: marketData.total_volume || 0,
          percent_change_24h: marketData.price_change_percentage_24h || 0,
        }
      }
    }
  }, [marketData])

  // Handle the analyze button click
  const onAnalyzeClick = () => {
    setIsDialogOpen(true)
    handleAnalyze()
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          onClick={onAnalyzeClick}
          variant="ghost"
          size="sm"
          className="h-8 px-2 rounded-xl w-auto pr-3 bg-zinc-800/40 hover:bg-zinc-900/50 ring-1 ring-zinc-800/80"
        >
          <IconSparkles className="h-4 w-4 fill-white/50" />
          <span className="text-white">Analyze</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        {/* Header */}
        <DialogHeader className="border-b border-zinc-800/50 pb-4">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex items-center gap-4 pt-3 pl-4">
                <Image
                  src={tokenData?.logoUrl || `https://assets.coingecko.com/coins/images/1/standard/bitcoin.png`}
                  alt={tokenData?.name || marketData?.name || 'Token'}
                  className="w-8 h-8 rounded-full ring-1 ring-white/10"
                  width={32}
                  height={32}
                  priority={true}
                  placeholder="blur"
                  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGBkbHB0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/favicon.ico';
                  }}
                />
                <div className="flex flex-col gap-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm font-semibold text-white">
                      {marketData?.name || tokenData?.name || 'Token Details'}
                    </h1>   
                    <span className={`text-[11px] font-mono font-thin ${
                      (marketData?.price_change_percentage_24h ?? 0) >= 0 
                        ? 'text-green-400' 
                        : 'text-red-400'
                    }`}>
                      {(marketData?.price_change_percentage_24h ?? 0) >= 0 ? '+' : ''}
                      {marketData?.price_change_percentage_24h?.toFixed(2)}%
                    </span>                 
                  </div>
                  <p className="text-xs text-white">
                    <span className="text-xs text-white/60">Today is </span> 
                    {new Date().toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div>
          <div className="h-[75vh] w-full">
            <div className="grid grid-cols-1 lg:grid-cols-4 divide-x divide-zinc-800/50">
              <div className="sticky top-0 lg:col-span-1">
                  {/* Market Metrics Sidebar */}
                  <MarketMetricsSidebar
                    coinId={coinId}
                    tokenSymbol={tokenData?.symbol}
                    marketData={transformedMarketData}
                    chartData={chartData || []}
                    volumeData={volumeData || []}
                    bbData={bbData || { indicator: [], upper: [], lower: [] }}
                    marketVisionData={marketVisionData || { moneyFlow: { fast: [] }, waveTrend: { wt1: [], wt2: [] } }}
                    openInterestData={openInterestData || {}}
                    liquidationData={liquidationData || {}}
                    takerBuySellData={takerBuySellData || {}}
                  />              
              </div>


              {/* Main Content */}
              <ScrollArea hideScrollbar={true} className="h-[75vh] w-full col-span-3 bg-zinc-950/50">
                <div className="relative lg:col-span-3 space-y-6 p-12 h-full">
                  <div className="relative h-full">
                    <AnalysisResult
                      isLoading={isAnalysisLoading}
                      result={analysisResult}
                      marketData={marketData}
                      tokenData={tokenData}
                    />
                  </div>
                </div>  
                <div className="sticky bottom-[-2px] h-[100px] inset-0 z-[1002] pointer-events-none bg-gradient-to-t from-white via-white/50 dark:via-zinc-950/50 to-transparent dark:from-zinc-950" />
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 