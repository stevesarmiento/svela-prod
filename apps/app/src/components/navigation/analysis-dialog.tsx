'use client'

import React from 'react'
import dynamic from "next/dynamic"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
} from '@v1/ui/dialog'
import { Button } from '@v1/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip"

import { ScrollArea } from '@v1/ui/scroll-area'
import Image from 'next/image'
import { IconBookPages, IconSparkles } from 'symbols-react'
import { useAnalysisData } from '@/hooks/use-analysis-data'

function loadMarketMetricsSidebar() {
  return import("./market-metrics-sidebar")
}

function loadAnalysisResult() {
  return import("./analysis-result")
}

const MarketMetricsSidebar = dynamic(
  () => loadMarketMetricsSidebar().then((module) => module.MarketMetricsSidebar),
  {
    ssr: false,
    loading: () => <div className="p-4" />,
  },
)

const AnalysisResult = dynamic(
  () => loadAnalysisResult().then((module) => module.AnalysisResult),
  { ssr: false, loading: () => null },
)

interface AnalysisDialogProps {
  coinId: string
  tokenData: {
    name?: string
    symbol?: string
    id?: string
    logoUrl?: string
  } | null
  triggerVariant?: "default" | "icon"
  triggerTooltip?: string
  triggerAriaLabel?: string
}

export function AnalysisDialog({
  coinId,
  tokenData,
  triggerVariant = "default",
  triggerTooltip,
  triggerAriaLabel,
}: AnalysisDialogProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)

  // Preload heavy dialog chunks on user intent (hover/focus).
  const preloadDialogChunks = React.useCallback(() => {
    void loadMarketMetricsSidebar()
    void loadAnalysisResult()
  }, [])

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              onPointerEnter={preloadDialogChunks}
              onFocus={preloadDialogChunks}
              onTouchStart={preloadDialogChunks}
              onClick={() => setIsDialogOpen(true)}
              aria-label={triggerAriaLabel ?? (triggerVariant === "icon" ? "Analyze with AI" : undefined)}
              variant="ghost"
              size="sm"
              className={
                triggerVariant === "icon"
                  ? "h-6 w-6 p-0 rounded-lg bg-transparent hover:bg-primary/5 transition-colors group"
                  : "h-8 px-2 rounded-xl w-auto pr-3 bg-gray-100/80 hover:bg-gray-200/80 ring-1 ring-gray-300/60 dark:bg-zinc-800/40 dark:hover:bg-zinc-900/50 dark:ring-zinc-800/80"
              }
            >
              {triggerVariant === "icon" ? (
                <IconBookPages className="h-4 w-4 fill-zinc-600 group-hover:fill-zinc-900 dark:fill-zinc-600 dark:group-hover:fill-white transition-colors" />
              ) : (
                <>
                  <IconSparkles className="h-4 w-4 fill-gray-600 dark:fill-white/50" />
                  <span className="text-gray-900 dark:text-white">Analyze</span>
                </>
              )}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-2 p-1.5 px-2 rounded-md text-xs">
          <span>{triggerTooltip ?? (triggerVariant === "icon" ? "Analyze with AI" : "Analyze")}</span>
        </TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        {isDialogOpen ? <AnalysisDialogBody coinId={coinId} tokenData={tokenData} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AnalysisDialogBody({ coinId, tokenData }: AnalysisDialogProps) {
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
  } = useAnalysisData({ coinId, tokenData, shouldCalculate: true })

  // Kick off analysis once we have market data (required for prepareAnalysisData()).
  const hasStartedAnalysisRef = React.useRef(false)
  React.useEffect(() => {
    if (!marketData || hasStartedAnalysisRef.current) return
    hasStartedAnalysisRef.current = true
    void handleAnalyze()
  }, [marketData, handleAnalyze])

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
        },
      },
    }
  }, [marketData])

  return (
    <>
      {/* Header */}
      <DialogHeader className="border-b border-gray-200 dark:border-zinc-800/50 pb-4">
        <DialogTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex items-center gap-4 pt-3 pl-4">
              <Image
                src={
                  tokenData?.logoUrl ||
                  `https://assets.coingecko.com/coins/images/1/standard/bitcoin.png`
                }
                alt={tokenData?.name || marketData?.name || "Token"}
                className="w-8 h-8 rounded-full ring-1 ring-gray-200 dark:ring-white/10"
                width={32}
                height={32}
                priority={true}
                placeholder="blur"
                blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGBkbHB0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.src = "/favicon.ico"
                }}
              />
              <div className="flex flex-col gap-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {marketData?.name || tokenData?.name || "Token Details"}
                  </h1>
                  <span
                    className={`text-[11px] font-diatype-mono font-thin ${
                      (marketData?.price_change_percentage_24h ?? 0) >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {(marketData?.price_change_percentage_24h ?? 0) >= 0 ? "+" : ""}
                    {marketData?.price_change_percentage_24h?.toFixed(2)}%
                  </span>
                </div>
                <p className="text-xs text-gray-900 dark:text-white">
                  <span className="text-xs text-gray-500 dark:text-white/60">
                    Today is{" "}
                  </span>
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>
        </DialogTitle>
      </DialogHeader>

      <div>
        <div className="h-[75vh] w-full">
          <div className="grid grid-cols-1 lg:grid-cols-4 divide-x divide-gray-200 dark:divide-zinc-800/50">
            <div className="sticky top-0 lg:col-span-1">
              {/* Market Metrics Sidebar (lazy) */}
              <MarketMetricsSidebar
                coinId={coinId}
                tokenSymbol={tokenData?.symbol}
                marketData={transformedMarketData}
                chartData={chartData || []}
                volumeData={volumeData || []}
                bbData={bbData || { indicator: [], upper: [], lower: [] }}
                marketVisionData={
                  marketVisionData || { moneyFlow: { fast: [] }, waveTrend: { wt1: [], wt2: [] } }
                }
                openInterestData={openInterestData || {}}
                liquidationData={liquidationData || {}}
                takerBuySellData={takerBuySellData || {}}
              />
            </div>

            {/* Main Content */}
            <ScrollArea
              hideScrollbar={true}
              className="h-[75vh] w-full col-span-3 bg-gray-50/50 dark:bg-zinc-950/50"
            >
              <div className="relative lg:col-span-3 space-y-6 p-12 h-full">
                <div className="relative h-full">
                  <AnalysisResult
                    isLoading={isAnalysisLoading || !marketData}
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
    </>
  )
}