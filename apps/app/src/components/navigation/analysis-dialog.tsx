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
import { Badge } from '@v1/ui/badge'
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
      <DialogContent className="max-w-7xl max-h-[90vh]">
        {/* Header */}
        <DialogHeader className="border-b border-zinc-800/50 pb-4">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex items-center gap-4 pt-3 pl-4">
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
            <div className="grid grid-cols-1 lg:grid-cols-4 divide-x divide-zinc-800/50">
              <div className="sticky top-0">
                  {/* Market Metrics Sidebar */}
                  <MarketMetricsSidebar
                    coinId={coinId}
                    tokenSymbol={tokenData?.symbol}
                    marketData={marketData || {}}
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
              <div className="lg:col-span-3 space-y-6 p-12">
                <div>
                  <h1 className="text-xl font-semibold mb-6 text-white">
                    {marketData?.name || tokenData?.name || 'Token'} Market Overview
                  </h1>

                  <AnalysisResult
                    isLoading={isAnalysisLoading}
                    result={analysisResult}
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
} 