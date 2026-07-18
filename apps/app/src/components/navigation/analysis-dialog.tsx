"use client";

import { Button } from "@v1/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@v1/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import dynamic from "next/dynamic";
import React from "react";

import { useAnalysisData } from "@/hooks/use-analysis-data";
import { getAlignedPriceFromChartPoints } from "@/lib/aligned-price";
import { getTokenLogoURL } from "@/lib/logo-overrides";
import { ScrollArea } from "@v1/ui/scroll-area";
import Image from "next/image";
import { IconBookPages, IconSparkles } from "symbols-react";
import { IconAnalyze } from "@/components/icon-analyze";
import { MultiStepLoader } from "@v1/ui/mult-step-loader";
import { cn } from "@v1/ui/cn";

function loadMarketMetricsSidebar() {
  return import("./market-metrics-sidebar");
}

function loadAnalysisResult() {
  return import("./analysis-result");
}

const MarketMetricsSidebar = dynamic(
  () =>
    loadMarketMetricsSidebar().then((module) => module.MarketMetricsSidebar),
  {
    ssr: false,
    loading: () => <div className="p-4" />,
  },
);

const AnalysisResult = dynamic(
  () => loadAnalysisResult().then((module) => module.AnalysisResult),
  { ssr: false, loading: () => null },
);

interface AnalysisDialogProps {
  coinId: string;
  tokenData: {
    name?: string;
    symbol?: string;
    id?: string;
    logoUrl?: string;
  } | null;
  /** Matches indicator card "Analyze" triggers. Only pass from chart detail header; other sites keep `icon` or `default`. */
  triggerVariant?: "default" | "icon" | "explain";
  /** Merged onto the trigger (e.g. chart header / nav-only polish). */
  triggerClassName?: string;
  triggerTooltip?: string;
  showTriggerTooltip?: boolean;
  triggerAriaLabel?: string;
  /** Visible label when `triggerVariant` is `explain` (default: Analyze). */
  triggerLabel?: string;
  /** Open immediately after mount; primarily for lazy-loaded trigger wrappers. */
  defaultOpen?: boolean;
  /** Render no trigger button — programmatic open only (pair with `defaultOpen`). */
  hideTrigger?: boolean;
  /** Notified alongside the internal open state (e.g. to unmount the host on close). */
  onOpenChange?: (open: boolean) => void;
}

export function AnalysisDialog({
  coinId,
  tokenData,
  triggerVariant = "default",
  triggerClassName,
  triggerTooltip,
  showTriggerTooltip = true,
  triggerAriaLabel,
  triggerLabel = "Analyze",
  defaultOpen = false,
  hideTrigger = false,
  onOpenChange,
}: AnalysisDialogProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(defaultOpen);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsDialogOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  // Preload heavy dialog chunks on user intent (hover/focus).
  const preloadDialogChunks = React.useCallback(() => {
    void loadMarketMetricsSidebar();
    void loadAnalysisResult();
  }, []);

  const isExplainTrigger = triggerVariant === "explain";

  const triggerButton = (
    <Button
      type="button"
      onPointerEnter={preloadDialogChunks}
      onFocus={preloadDialogChunks}
      onTouchStart={preloadDialogChunks}
      onClick={() => setIsDialogOpen(true)}
      aria-label={
        triggerAriaLabel ??
        (triggerVariant === "icon" || isExplainTrigger
          ? "Deep analysis"
          : undefined)
      }
      variant={isExplainTrigger ? "outline" : "ghost"}
      size="sm"
      className={cn(
        isExplainTrigger
          ? "flex items-center gap-1.5 shrink-0 h-7 p-2.5 rounded-lg"
          : triggerVariant === "icon"
            ? "h-6 w-6 p-1 rounded-lg bg-transparent hover:bg-primary/5 transition-colors group"
            : "h-8 px-2 rounded-xl w-auto pr-3 bg-gray-100/80 hover:bg-gray-200/80 ring-1 ring-gray-300/60 dark:bg-zinc-800/40 dark:hover:bg-zinc-900/50 dark:ring-zinc-800/80",
        triggerClassName,
      )}
    >
      {triggerVariant === "icon" ? (
        <IconAnalyze className="size-3.5 fill-zinc-400 dark:group-hover:fill-white transition-colors" />
      ) : isExplainTrigger ? (
        <>
          <IconAnalyze className="size-3 fill-primary/60" />
          <span>{triggerLabel}</span>
        </>
      ) : (
        <>
          <IconSparkles className="h-4 w-4 fill-gray-600 dark:fill-white/50" />
          <span className="text-gray-900 dark:text-white">{triggerLabel}</span>
        </>
      )}
    </Button>
  );

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
      {hideTrigger ? null : showTriggerTooltip ? (
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{triggerButton}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="left" className="flex items-center gap-2 p-1.5 px-2 rounded-md text-xs">
            <span>
              {triggerTooltip ??
                (triggerVariant === "icon" || isExplainTrigger
                  ? "Deep analysis"
                  : "Analyze")}
            </span>
          </TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
      )}
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.1),inset_0_-4px_30px_oklch(0_0_0_/_0.1),0_4px_8px_oklch(0_0_0_/_0.05)] dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_1990px_oklch(0.2978_0.0083_317.72_/_0.3),0_4px_16px_oklch(0_0_0_/_0.6)]">
        {isDialogOpen ? (
          <AnalysisDialogBody coinId={coinId} tokenData={tokenData} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
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
  } = useAnalysisData({ coinId, tokenData, shouldCalculate: true });

  const analysisSteps = React.useMemo(
    () => [
      { text: "Analyzing price data" },
      { text: "Looking at trend" },
      { text: "Understanding orderflow" },
      { text: "Considering liquidations" },
      { text: "Looking at open interest" },
      { text: "Understanding the market" },
      { text: "Thinking..." },
      { text: "Writing out thoughts" },
      { text: "I have a lot of thoughts..." },
      { text: "Im embarassed to be taking this long..." },
      { text: "Pardon my tardiness..." },
      { text: "I'm just a little bit nervous..." },
      { text: "You're so awesome :)" },
    ],
    [],
  );

  // Must match the effect below: analysis only starts once we have enough OHLCV history.
  const hasEnoughChartHistory =
    chartData.length >= 30 && volumeData.length >= 30;

  // Kick off analysis once we have market data (required for prepareAnalysisData()).
  const hasStartedAnalysisRef = React.useRef(false);
  React.useEffect(() => {
    // Avoid firing analysis before we have enough history to produce meaningful indicators.
    // CoinGecko chart + volume data often arrive after marketData, and early runs can produce 0/1-period artifacts.
    if (!marketData || !hasEnoughChartHistory || hasStartedAnalysisRef.current)
      return;
    hasStartedAnalysisRef.current = true;
    void handleAnalyze();
  }, [marketData, hasEnoughChartHistory, handleAnalyze]);

  // Transform CoinGecko marketData to expected format for MarketMetricsSidebar
  const transformedMarketData = React.useMemo(() => {
    if (!marketData) return {};

    const alignedPrice =
      getAlignedPriceFromChartPoints(chartData) ??
      marketData.current_price ??
      0;

    return {
      quote: {
        USD: {
          price: alignedPrice,
          market_cap: marketData.market_cap || 0,
          volume_24h: marketData.total_volume || 0,
          percent_change_24h: marketData.price_change_percentage_24h || 0,
        },
      },
    };
  }, [marketData, chartData]);

  const logoSrc = React.useMemo(() => {
    const symbol = tokenData?.symbol ?? marketData?.symbol;
    const fallbackLogoUrl = tokenData?.logoUrl ?? marketData?.image;
    const resolvedLogoUrl = getTokenLogoURL(symbol, fallbackLogoUrl);

    if (
      resolvedLogoUrl?.startsWith("http://") ||
      resolvedLogoUrl?.startsWith("https://") ||
      resolvedLogoUrl?.startsWith("/")
    ) {
      return resolvedLogoUrl;
    }

    return "/favicon.ico";
  }, [marketData?.image, marketData?.symbol, tokenData?.logoUrl, tokenData?.symbol]);

  return (
    <div className="relative">
      {/* Header */}
      <DialogHeader className="border-b border-gray-200 dark:border-zinc-800/50 pb-4">
        <DialogTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex items-center gap-4 pt-3 pl-4">
              <Image
                src={logoSrc}
                alt={tokenData?.name || marketData?.name || "Token"}
                className="w-8 h-8 rounded-full ring-1 ring-gray-200 dark:ring-white/10"
                width={32}
                height={32}
                priority={true}
                placeholder="blur"
                blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGBkbHB0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = "/favicon.ico";
                }}
              />
              <div className="flex flex-col gap-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {marketData?.name || tokenData?.name || "Token Details"}
                  </h1>
                  <span
                    className={`text-[11px] font-berkeley-mono font-thin ${
                      (marketData?.price_change_percentage_24h ?? 0) >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {(marketData?.price_change_percentage_24h ?? 0) >= 0
                      ? "+"
                      : ""}
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
                  marketVisionData || {
                    moneyFlow: { fast: [] },
                    waveTrend: { wt1: [], wt2: [] },
                  }
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
                    isLoading={
                      isAnalysisLoading ||
                      !marketData ||
                      (Boolean(marketData) && !hasEnoughChartHistory)
                    }
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

      {isAnalysisLoading ? (
        <MultiStepLoader
          loadingStates={analysisSteps}
          loading={true}
          duration={2000}
          loop={true}
          variant="dialog"
        />
      ) : null}
    </div>
  );
}
