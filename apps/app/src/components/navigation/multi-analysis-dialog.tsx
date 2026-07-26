"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@v1/ui/dialog";
import { useCompletion } from "@ai-sdk/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import React from "react";

import { useAnalysisData } from "@/hooks/use-analysis-data";
import type { IndicatorData } from "@/lib/analyze-shared";
import {
  computeComparativeStats,
  type ComparativeStats,
  type ComparativeStatsInput,
} from "@/lib/comparative-stats";
import { computeDailyBbwpPct } from "@/lib/comparative-indicators";
import { getTokenLogoURL } from "@/lib/logo-overrides";
import { MultiStepLoader } from "@v1/ui/mult-step-loader";
import { ScrollArea } from "@v1/ui/scroll-area";

function loadComparativeStatsPanel() {
  return import("./comparative-stats-panel");
}

function loadAnalysisResult() {
  return import("./analysis-result");
}

const ComparativeStatsPanel = dynamic(
  () =>
    loadComparativeStatsPanel().then((module) => module.ComparativeStatsPanel),
  { ssr: false, loading: () => <div className="p-4" /> },
);

const AnalysisResult = dynamic(
  () => loadAnalysisResult().then((module) => module.AnalysisResult),
  { ssr: false, loading: () => null },
);

export interface AnalyzeToken {
  id: string;
  name?: string;
  symbol?: string;
  logoUrl?: string;
}

interface MultiAnalysisDialogProps {
  /** 2..5 tokens, deduped by id. */
  tokens: AnalyzeToken[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function safeLogoSrc(token: AnalyzeToken): string {
  const resolved = getTokenLogoURL(token.symbol, token.logoUrl);
  if (
    resolved?.startsWith("http://") ||
    resolved?.startsWith("https://") ||
    resolved?.startsWith("/")
  ) {
    return resolved;
  }
  return "/favicon.ico";
}

/**
 * Invisible collector — one per token. Fetches/computes the full indicator
 * set via useAnalysisData (react-query dedupes with prior single-token
 * fetches) and reports the prepared IndicatorData up exactly once. The
 * cross-asset sidebar is rendered from the aggregated stats, so this
 * renders nothing.
 */
function TokenAnalysisCollector({
  token,
  onReady,
}: {
  token: AnalyzeToken;
  onReady: (
    coinId: string,
    data: IndicatorData,
    series: Array<{ time: unknown; value: number }>,
  ) => void;
}) {
  const { marketData, chartData, volumeData, prepareAnalysisData } =
    useAnalysisData({ coinId: token.id, tokenData: token, shouldCalculate: true });

  // Same gating as the single-token AnalysisDialogBody: enough OHLCV history
  // for meaningful indicators before reporting up.
  const hasEnoughChartHistory =
    chartData.length >= 30 && volumeData.length >= 30;

  // prepareAnalysisData and onReady are fresh closures every render, so keep
  // them in refs: the effect deps track only genuine data transitions (no
  // per-render recompute) while the ref guard keeps the report-exactly-once
  // contract. Synced in an effect (declared before the reader) so render
  // stays pure.
  const reportedRef = React.useRef(false);
  const prepareAnalysisDataRef = React.useRef(prepareAnalysisData);
  const onReadyRef = React.useRef(onReady);
  React.useEffect(() => {
    prepareAnalysisDataRef.current = prepareAnalysisData;
    onReadyRef.current = onReady;
  }, [prepareAnalysisData, onReady]);
  React.useEffect(() => {
    if (reportedRef.current || !marketData || !hasEnoughChartHistory) return;
    const data = prepareAnalysisDataRef.current();
    if (!data) return;
    reportedRef.current = true;
    // Pass the raw timestamped series too: cross-asset stats must be aligned
    // by day, which the flattened priceHistory can't support.
    // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent -- invisible per-token collector over react-query; reports once via reportedRef
    onReadyRef.current(token.id, data as IndicatorData, chartData);
  }, [marketData, hasEnoughChartHistory, chartData, token.id]);

  return null;
}

const COMPARE_STEPS = [
  { text: "Gathering data for every token" },
  { text: "Lining up the price histories" },
  { text: "Computing correlations" },
  { text: "Measuring betas vs the benchmark" },
  { text: "Comparing risk-adjusted momentum" },
  { text: "Weighing order flow" },
  { text: "Checking who's overheated" },
  { text: "Looking for rotation" },
  { text: "Thinking..." },
  { text: "Writing the comparison" },
  { text: "So many tokens, so little time..." },
  { text: "You're so awesome :)" },
];

export function MultiAnalysisDialog({
  tokens,
  open,
  onOpenChange,
}: MultiAnalysisDialogProps) {
  const [collected, setCollected] = React.useState<
    Map<string, Omit<ComparativeStatsInput, "id">>
  >(() => new Map());
  const [comparativeStats, setComparativeStats] =
    React.useState<ComparativeStats | null>(null);

  const handleReady = React.useCallback(
    (
      coinId: string,
      data: IndicatorData,
      series: Array<{ time: unknown; value: number }>,
    ) => {
      setCollected((prev) =>
        prev.has(coinId)
          ? prev
          : new Map(prev).set(coinId, {
              data,
              series,
              bbwpPct: computeDailyBbwpPct(series),
            }),
      );
    },
    [],
  );

  const {
    complete,
    completion,
    isLoading: isStreaming,
    stop: stopStream,
    setCompletion,
  } = useCompletion({
    api: "/api/analyze/compare",
    streamProtocol: "text",
    experimental_throttle: 60,
    onError: (error: Error) => {
      console.error("Comparison analysis failed:", error);
      setCompletion("Failed to generate comparison. Please try again.");
    },
  });

  React.useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // Fire ONCE with all ready tokens: compute the cross-asset stats client-side
  // (correlation/beta/vol — never left to the LLM) and send them alongside
  // the per-token indicator payloads.
  const startedRef = React.useRef(false);
  const fire = React.useCallback(
    (entries: ComparativeStatsInput[]) => {
      if (startedRef.current || entries.length < 2) return;
      startedRef.current = true;
      const comparative = computeComparativeStats(entries);
      setComparativeStats(comparative);
      void complete(
        JSON.stringify({ tokens: entries.map((e) => e.data), comparative }),
      );
    },
    [complete],
  );

  React.useEffect(() => {
    if (collected.size === tokens.length && tokens.length >= 2) {
      const entries = tokens.flatMap((t) => {
        const entry = collected.get(t.id);
        return entry ? [{ id: t.id, ...entry }] : [];
      });
      fire(entries);
    }
  }, [collected, tokens, fire]);

  // Fallback: if some token's data never becomes ready (thin markets, failed
  // CoinGlass endpoints), run with whatever subset is ready after 30s.
  // Effect Event: reads the latest `collected`/`tokens`/`fire` without being
  // reactive deps, so the 30s timer is armed exactly once.
  const runFallbackAnalysis = React.useEffectEvent(() => {
    if (startedRef.current) return;
    const ready = tokens.flatMap((t) => {
      const entry = collected.get(t.id);
      return entry ? [{ id: t.id, ...entry }] : [];
    });
    if (ready.length >= 2) {
      fire(ready);
    } else {
      setCompletion(
        "Not enough market data loaded to run a comparison. Please try again.",
      );
    }
  });
  React.useEffect(() => {
    const timer = setTimeout(() => runFallbackAnalysis(), 30_000);
    return () => clearTimeout(timer);
  }, []);

  const tokenLabels = tokens.map(
    (t) => t.symbol?.toUpperCase() ?? t.name ?? t.id,
  );
  const combinedTitle = tokenLabels.join(" / ");

  // Format the date post-mount so server and browser markup can't diverge on
  // timezone (toLocaleDateString during SSR uses the server's timezone).
  const [analysisDateLabel, setAnalysisDateLabel] = React.useState("");
  React.useEffect(() => {
    setAnalysisDateLabel(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    );
  }, []);

  // Price series for the sidebar's multi-line mini chart, as they collect.
  const chartTokens = React.useMemo(
    () =>
      tokens.flatMap((t) => {
        const entry = collected.get(t.id);
        return entry?.series && entry.series.length > 0
          ? [{ id: t.id, symbol: t.symbol ?? t.id, series: entry.series }]
          : [];
      }),
    [tokens, collected],
  );

  const isPreparing = !startedRef.current && collected.size < tokens.length;
  const showLoader = isPreparing || isStreaming;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.1),inset_0_-4px_30px_oklch(0_0_0_/_0.1),0_4px_8px_oklch(0_0_0_/_0.05)] dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_1990px_oklch(0.2978_0.0083_317.72_/_0.3),0_4px_16px_oklch(0_0_0_/_0.6)]">
        {open ? (
          <div className="relative">
            {/* Header */}
            <DialogHeader className="border-b border-gray-200 dark:border-zinc-800/50 pb-4">
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-4 pt-3 pl-4">
                  <div className="flex items-center -space-x-2">
                    {tokens.map((token) => (
                      <Image
                        key={token.id}
                        src={safeLogoSrc(token)}
                        alt={token.name || token.id}
                        className="h-8 w-8 rounded-full ring-2 ring-white dark:ring-zinc-900"
                        width={32}
                        height={32}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "/favicon.ico";
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-col gap-0">
                    <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {tokenLabels.map((label, index) => (
                        <React.Fragment key={label}>
                          {index > 0 ? (
                            <span className="opacity-50"> / </span>
                          ) : null}
                          {label}
                        </React.Fragment>
                      ))}
                    </h1>
                    <p className="text-xs text-gray-900 dark:text-white">
                      <span className="text-xs text-gray-500 dark:text-white/60">
                        Analysis as of{" "}
                      </span>
                      {analysisDateLabel}
                    </p>
                  </div>
                </div>
              </DialogTitle>
            </DialogHeader>

            {/* Invisible per-token data collectors */}
            {tokens.map((token) => (
              <TokenAnalysisCollector
                key={token.id}
                token={token}
                onReady={handleReady}
              />
            ))}

            <div>
              <div className="h-[75vh] w-full">
                <div className="grid grid-cols-1 lg:grid-cols-4 divide-x divide-gray-200 dark:divide-zinc-800/50">
                  {/* Cross-asset stats sidebar — same numbers fed to the prompt */}
                  <div className="sticky top-0 lg:col-span-1">
                    <ComparativeStatsPanel
                      stats={comparativeStats}
                      expectedCount={tokens.length}
                      chartTokens={chartTokens}
                    />
                  </div>

                  {/* Main content: the combined relationship report */}
                  <ScrollArea
                    hideScrollbar={true}
                    className="h-[75vh] w-full col-span-3 bg-gray-50/50 dark:bg-zinc-950/50"
                  >
                    <div className="relative lg:col-span-3 space-y-6 p-12 h-full">
                      <div className="relative h-full">
                        <AnalysisResult
                          isLoading={showLoader}
                          result={completion}
                          tokenData={{ name: combinedTitle }}
                        />
                      </div>
                    </div>
                    <div className="sticky bottom-[-2px] h-[100px] inset-0 z-[1002] pointer-events-none bg-gradient-to-t from-white via-white/50 dark:via-zinc-950/50 to-transparent dark:from-zinc-950" />
                  </ScrollArea>
                </div>
              </div>
            </div>

            {showLoader ? (
              <MultiStepLoader
                loadingStates={COMPARE_STEPS}
                loading={true}
                duration={2000}
                loop={true}
                variant="dialog"
              />
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
