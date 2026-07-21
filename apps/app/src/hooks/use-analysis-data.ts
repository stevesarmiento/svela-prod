"use client";

import {
  calculateBollingerBands,
  useMarketVisionB,
} from "@/hooks/market-vision";
import { reverseRsiLevels } from "@/hooks/market-vision/technical-indicators";
import { useCoinGeckoChartData } from "@/hooks/use-coingecko-chart-data";
import { useLiquidationHistory } from "@/hooks/use-liquidation-history";
import { useOpenInterest } from "@/hooks/use-open-interest";
import { useTakerBuySell } from "@/hooks/use-taker-buy-sell";
import { useCompletion } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import type { Time } from "lightweight-charts";
import { useEffect, useMemo } from "react";

// Single source of truth for synthetic OHLCV bars derived from line-chart
// data. Used by both the memoized path and the on-demand analysis fallback so
// the AI payload always matches the indicators rendered on screen.
function buildSyntheticOhlcv(
  chartData: { time: Time; value: number }[],
  volumeData: { time: Time; value: number }[],
) {
  return chartData.map((point, index) => {
    const price = point.value;
    const volume = volumeData[index]?.value || 0;
    const prevPrice = index > 0 ? chartData[index - 1]?.value || price : price;

    const priceChange = price - prevPrice;
    const volatility = Math.abs(priceChange) * 0.3 + price * 0.001;

    const open = prevPrice;
    const close = price;
    const spread = volatility * 0.5;
    const high = Math.max(open, close) + spread;
    const low = Math.min(open, close) - spread;

    return {
      time:
        typeof point.time === "string"
          ? new Date(point.time).getTime() / 1000
          : (point.time as number),
      open,
      high,
      low,
      close,
      volume,
    };
  });
}

interface UseAnalysisDataProps {
  coinId: string;
  tokenData: {
    name?: string;
    symbol?: string;
    id?: string;
    logoUrl?: string;
  } | null;
  shouldCalculate: boolean;
}

export function useAnalysisData({
  coinId,
  tokenData,
  shouldCalculate,
}: UseAnalysisDataProps) {
  const {
    complete,
    completion: analysisResult,
    isLoading: isAnalysisLoading,
    stop: stopAnalysis,
    setCompletion: setAnalysisResult,
  } = useCompletion({
    api: "/api/analyze",
    streamProtocol: "text",
    experimental_throttle: 60,
    onError: (error: Error) => {
      console.error("Analysis failed:", error);
      setAnalysisResult("Failed to generate analysis. Please try again.");
    },
  });

  useEffect(() => {
    return () => {
      stopAnalysis();
    };
  }, [stopAnalysis]);

  const activeTimeScale = "30d";
  const EMPTY_ARRAY = useMemo(() => [], []);

  // Fetch market data from CoinGecko.
  // Canonical key family for /api/coingecko/markets — keeps this cache
  // entry deduped with (and invalidated alongside) other consumers.
  const { data: marketData } = useQuery({
    queryKey: ["coingecko-market-data", coinId],
    queryFn: async () => {
      const response = await fetch(`/api/coingecko/markets?ids=${coinId}`);
      if (!response.ok) throw new Error("Failed to fetch market data");
      const data = await response.json();
      return data.data?.[0]; // CoinGecko returns an array, get the first item
    },
    staleTime: 5 * 60 * 1000,
  });

  // Safe fallback for market data
  const safeInitialData = marketData
    ? {
        price: marketData.current_price || 0,
        volume_24h: marketData.total_volume || 0,
        market_cap: marketData.market_cap || 0,
        percent_change_24h: marketData.price_change_percentage_24h || 0,
        percent_change_1h: 0, // CoinGecko doesn't provide 1h change in markets endpoint
        percent_change_7d: 0, // Would need different endpoint for 7d change
        percent_change_30d: 0, // Would need different endpoint for 30d change
        percent_change_60d: 0, // Not available in CoinGecko markets
        percent_change_90d: 0, // Not available in CoinGecko markets
        market_cap_dominance: 0, // Not available in CoinGecko markets
        fully_diluted_market_cap: marketData.fully_diluted_valuation || 0,
        tvl: null,
        last_updated: marketData.last_updated || new Date().toISOString(),
      }
    : {
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
        last_updated: new Date().toISOString(),
      };

  const { chartData, volumeData } = useCoinGeckoChartData(
    coinId,
    activeTimeScale,
    safeInitialData,
  );

  // Calculate OHLCV data when needed
  const ohlcvData = useMemo(() => {
    if (!shouldCalculate || !chartData.length || !volumeData.length) {
      return EMPTY_ARRAY;
    }

    return buildSyntheticOhlcv(chartData, volumeData);
  }, [shouldCalculate, chartData, volumeData, EMPTY_ARRAY]);

  // Memoized Bollinger config
  const bollingerConfig = useMemo(
    () => ({
      drawRSI: true,
      drawMFI: false,
      highlightBreaches: true,
      length: 14,
      source: "hlc3" as const,
      bbLength: 20,
      multiplier: 2.0,
      lineWidth: 2,
      fillOpacity: 0.1,
    }),
    [],
  );

  // Calculate indicators
  const marketVisionData = useMarketVisionB(
    shouldCalculate ? ohlcvData : EMPTY_ARRAY,
  );

  const bbData = useMemo(() => {
    if (!shouldCalculate) {
      return { indicator: [], upper: [], lower: [], basis: [] };
    }
    return calculateBollingerBands(ohlcvData, bollingerConfig);
  }, [shouldCalculate, ohlcvData, bollingerConfig]);

  // Fetch real market data
  const { data: openInterestData } = useOpenInterest({
    symbol: coinId,
    interval: "4h",
    limit: 50,
    unit: "usd",
  });

  const { data: liquidationData } = useLiquidationHistory({
    symbol: coinId,
    interval: "1d",
    exchangeList:
      "Binance, Bybit, OKX, Gate, HTX, Hyperliquid, CoinEx, Bitmex, Bitfinex",
    limit: 7,
  });

  const { data: takerBuySellData } = useTakerBuySell({
    symbol: coinId,
    range: "24h",
  });

  // Prepare analysis data
  const prepareAnalysisData = () => {
    if (!marketData) return null;

    // Force calculate OHLCV data if not available
    let analysisOhlcvData = ohlcvData;
    if (
      ohlcvData.length === 0 &&
      chartData.length > 0 &&
      volumeData.length > 0
    ) {
      analysisOhlcvData = buildSyntheticOhlcv(chartData, volumeData);
    }

    // Force calculate Bollinger Bands if not available
    let analysisBBData = bbData;
    if (bbData.indicator.length === 0 && analysisOhlcvData.length > 0) {
      analysisBBData = calculateBollingerBands(
        analysisOhlcvData,
        bollingerConfig,
      );
    }

    // Get latest values
    const latestBB = {
      indicator: analysisBBData.indicator[analysisBBData.indicator.length - 1],
      upper: analysisBBData.upper[analysisBBData.upper.length - 1],
      lower: analysisBBData.lower[analysisBBData.lower.length - 1],
      basis: analysisBBData.basis[analysisBBData.basis.length - 1],
    };

    const latestWTValues = {
      wt1: marketVisionData.series.wt1[marketVisionData.series.wt1.length - 1]?.value || 0,
      wt2: marketVisionData.series.wt2[marketVisionData.series.wt2.length - 1]?.value || 0,
    };

    const latestMFValue =
      marketVisionData.series.rsiMfi[marketVisionData.series.rsiMfi.length - 1]?.value || 0;

    // Wave Trend posture: cross detection vs the previous bar, then VMC
    // overbought/oversold zones (±53).
    const hasWaveTrendData = marketVisionData.series.wt1.length >= 2;
    const prevWt1 =
      marketVisionData.series.wt1[marketVisionData.series.wt1.length - 2]?.value;
    const prevWt2 =
      marketVisionData.series.wt2[marketVisionData.series.wt2.length - 2]?.value;
    const waveTrendSignal =
      typeof prevWt1 === "number" &&
      typeof prevWt2 === "number" &&
      prevWt1 <= prevWt2 &&
      latestWTValues.wt1 > latestWTValues.wt2
        ? ("bullish_cross" as const)
        : typeof prevWt1 === "number" &&
            typeof prevWt2 === "number" &&
            prevWt1 >= prevWt2 &&
            latestWTValues.wt1 < latestWTValues.wt2
          ? ("bearish_cross" as const)
          : latestWTValues.wt1 >= 53
            ? ("overbought" as const)
            : latestWTValues.wt1 <= -53
              ? ("oversold" as const)
              : ("neutral" as const);
    const waveTrendSpread = Math.abs(latestWTValues.wt1 - latestWTValues.wt2);
    const waveTrendMomentum =
      waveTrendSpread >= 10
        ? ("strong" as const)
        : waveTrendSpread >= 5
          ? ("moderate" as const)
          : ("weak" as const);

    // Money Flow posture from the VMC rsiMfi oscillator (positive = inflow).
    const hasMoneyFlowData = marketVisionData.series.rsiMfi.length > 0;
    const moneyFlowDirection =
      latestMFValue > 0
        ? ("inflow" as const)
        : latestMFValue < 0
          ? ("outflow" as const)
          : ("neutral" as const);
    const moneyFlowStrength =
      Math.abs(latestMFValue) >= 10
        ? ("strong" as const)
        : Math.abs(latestMFValue) >= 5
          ? ("moderate" as const)
          : ("weak" as const);

    // Reverse-RSI price levels: next-bar close needed for a standard 14-period
    // close-based Wilder RSI to print each Caretaker zone level (80/62/50/38/20).
    // NOTE: the displayed RSI value below is hlc3-based (Bollinger-on-RSI), so
    // these close-based trigger prices are labeled via `reverseBasis`.
    const reverseLevels = reverseRsiLevels(
      analysisOhlcvData.map((bar: { close: number }) => bar.close),
      14,
    );

    // Calculate historical trends
    const bollingerHistory = analysisBBData.indicator
      .slice(-30)
      .map((item: { value: number }) => item?.value)
      .filter(
        (value: number | undefined): value is number =>
          typeof value === "number" && value >= 0 && value <= 100,
      );
    const rsiHistory = bollingerHistory.length > 0 ? bollingerHistory : [];

    const priceHistory = chartData
      .slice(-30)
      .map((item: { value: number }) => item.value)
      .filter(
        (value: number | undefined): value is number =>
          typeof value === "number",
      );
    const volumeHistory = volumeData
      .slice(-30)
      .map((item: { value: number }) => item.value)
      .filter(
        (value: number | undefined): value is number =>
          typeof value === "number",
      );

    // Calculate trends
    const rsiTrend =
      rsiHistory.length >= 14
        ? rsiHistory.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7 >
          rsiHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) /
            7
          ? "improving"
          : "deteriorating"
        : "neutral";

    const recentPrices = priceHistory.slice(-7);
    const previousPrices = priceHistory.slice(-14, -7);
    const recentAvg =
      recentPrices.length > 0
        ? recentPrices.reduce((a: number, b: number) => a + b, 0) /
          recentPrices.length
        : null;
    const previousAvg =
      previousPrices.length > 0
        ? previousPrices.reduce((a: number, b: number) => a + b, 0) /
          previousPrices.length
        : null;
    const momentum =
      recentAvg !== null && previousAvg !== null
        ? recentAvg > previousAvg
          ? "bullish"
          : "bearish"
        : null;

    const recentVolumeValues = volumeHistory.slice(-7);
    const previousVolumeValues = volumeHistory.slice(-14, -7);
    const recentVolume =
      recentVolumeValues.length > 0
        ? recentVolumeValues.reduce((a: number, b: number) => a + b, 0) /
          recentVolumeValues.length
        : null;
    const previousVolume =
      previousVolumeValues.length > 0
        ? previousVolumeValues.reduce((a: number, b: number) => a + b, 0) /
          previousVolumeValues.length
        : null;
    const volumeTrend =
      recentVolume !== null && previousVolume !== null
        ? recentVolume > previousVolume * 1.2
          ? "increasing"
          : recentVolume < previousVolume * 0.8
            ? "decreasing"
            : "stable"
        : null;

    const recentPriceData = priceHistory.slice(-21);
    const currentPrice = marketData?.current_price || 0;
    const support =
      recentPriceData.length > 0 ? Math.min(...recentPriceData) : null;
    const resistance =
      recentPriceData.length > 0 ? Math.max(...recentPriceData) : null;

    // Detect divergences
    const currentRSIAvg =
      rsiHistory.length >= 7
        ? rsiHistory.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7
        : 50;
    const previousRSIAvg =
      rsiHistory.length >= 14
        ? rsiHistory.slice(-14, -7).reduce((a: number, b: number) => a + b, 0) /
          7
        : 50;

    const priceDirection =
      previousAvg !== null
        ? currentPrice > previousAvg
          ? "up"
          : "down"
        : null;
    const rsiDirection = currentRSIAvg > previousRSIAvg ? "up" : "down";
    const divergence =
      priceDirection && priceDirection !== rsiDirection
        ? priceDirection === "up"
          ? "bearish"
          : "bullish"
        : "none";

    const percentChange = marketData?.price_change_percentage_24h || 0;

    // Get real market data
    const latestOpenInterest =
      openInterestData?.data?.[openInterestData.data?.length - 1];
    const currentOpenInterest =
      typeof latestOpenInterest?.close === "number"
        ? latestOpenInterest.close
        : null;
    const openInterestChange =
      currentOpenInterest !== null && (openInterestData?.data?.length || 0) >= 2
        ? ((currentOpenInterest -
            (openInterestData?.data?.[openInterestData.data.length - 2]
              ?.close || 0)) /
            (openInterestData?.data?.[openInterestData.data.length - 2]
              ?.close || 1)) *
          100
        : null;

    const recentLiquidations = liquidationData?.data?.slice(-1)?.[0];
    const totalLiquidations24h = recentLiquidations
      ? recentLiquidations.longLiquidations +
        recentLiquidations.shortLiquidations
      : null;
    const longLiquidations =
      typeof recentLiquidations?.longLiquidations === "number"
        ? recentLiquidations.longLiquidations
        : null;
    const shortLiquidations =
      typeof recentLiquidations?.shortLiquidations === "number"
        ? recentLiquidations.shortLiquidations
        : null;

    const takerOverall = takerBuySellData?.data?.overall;
    const takerExchanges = takerBuySellData?.data?.exchanges;
    const hasMeaningfulTakerOverall =
      !!takerOverall &&
      typeof takerOverall.totalVolumeUsd === "number" &&
      takerOverall.totalVolumeUsd > 0 &&
      Array.isArray(takerExchanges) &&
      takerExchanges.length > 0;

    const actualBuyRatio = hasMeaningfulTakerOverall
      ? takerOverall.buyRatio
      : null;
    const actualSellRatio = hasMeaningfulTakerOverall
      ? takerOverall.sellRatio
      : null;
    const buyVolumeUsd = hasMeaningfulTakerOverall
      ? takerOverall.buyVolumeUsd
      : null;
    const sellVolumeUsd = hasMeaningfulTakerOverall
      ? takerOverall.sellVolumeUsd
      : null;

    return {
      name: marketData.name || tokenData?.name || "Unknown Token",
      symbol: marketData.symbol || tokenData?.symbol || "UNK",
      quote: {
        USD: {
          price: marketData.current_price || 0,
          percent_change_24h: marketData.price_change_percentage_24h || 0,
          market_cap: marketData.market_cap || 0,
          volume_24h: marketData.total_volume || 0,
          volume_change_24h: 0, // CoinGecko doesn't provide this in markets endpoint
          market_cap_dominance: 0, // CoinGecko doesn't provide this in markets endpoint
        },
      },
      timeframe: activeTimeScale,

      priceContext:
        priceHistory.length >= 14 &&
        momentum &&
        support !== null &&
        resistance !== null
          ? {
              currentPrice: currentPrice,
              priceHistory: priceHistory,
              momentum: momentum,
              volatility:
                Math.abs(percentChange) > 5
                  ? "high"
                  : Math.abs(percentChange) > 2
                    ? "moderate"
                    : "low",
              support: support,
              resistance: resistance,
            }
          : undefined,

      volumeAnalysis:
        volumeHistory.length >= 14 &&
        volumeTrend &&
        recentVolume !== null &&
        previousVolume !== null
          ? {
              currentVolume: marketData?.total_volume || 0,
              volumeHistory: volumeHistory,
              volumeTrend: volumeTrend,
              averageVolume:
                volumeHistory.length > 0
                  ? volumeHistory.reduce((a: number, b: number) => a + b, 0) /
                    volumeHistory.length
                  : 0,
              volumeSpike: recentVolume > previousVolume * 1.5,
            }
          : undefined,

      hullSuite: momentum
        ? {
            trendDirection:
              momentum === "bullish"
                ? ("bullish" as const)
                : ("bearish" as const),
            crossoverSignal: "none" as const,
            strength:
              Math.abs(percentChange) > 3
                ? ("strong" as const)
                : ("moderate" as const),
          }
        : undefined,

      bollingerBands: latestBB.indicator
        ? {
            indicator: "RSI" as const,
            currentValue: latestBB.indicator.value,
            upperBand: latestBB.upper?.value || 0,
            lowerBand: latestBB.lower?.value || 0,
            basis: latestBB.basis?.value || 0,
            position:
              latestBB.indicator.value > (latestBB.upper?.value || 70)
                ? ("overbought" as const)
                : latestBB.indicator.value < (latestBB.lower?.value || 30)
                  ? ("oversold" as const)
                  : ("normal" as const),
            breachType: "none" as const,
            divergence: divergence as "bullish" | "bearish" | "none",
            trend: rsiTrend,
            history: rsiHistory,
          }
        : undefined,

      marketVision: latestBB.indicator
        ? {
            rsi: {
              value: latestBB.indicator.value,
              signal:
                latestBB.indicator.value > 70
                  ? ("overbought" as const)
                  : latestBB.indicator.value < 30
                    ? ("oversold" as const)
                    : ("neutral" as const),
              trend: rsiTrend,
              history: rsiHistory,
              divergence: divergence as "bullish" | "bearish" | "none",
              reverseLevels,
              reverseBasis: "close_rsi14" as const,
            },
            waveTrend: hasWaveTrendData
              ? {
                  wt1: latestWTValues.wt1,
                  wt2: latestWTValues.wt2,
                  signal: waveTrendSignal,
                  momentum: waveTrendMomentum,
                }
              : undefined,
            moneyFlow: hasMoneyFlowData
              ? {
                  direction: moneyFlowDirection,
                  strength: moneyFlowStrength,
                  value: latestMFValue,
                }
              : undefined,
          }
        : undefined,

      liquidationData:
        totalLiquidations24h !== null ||
        longLiquidations !== null ||
        shortLiquidations !== null ||
        currentOpenInterest !== null ||
        openInterestChange !== null
          ? {
              totalLiquidations24h: totalLiquidations24h ?? undefined,
              longLiquidations: longLiquidations ?? undefined,
              shortLiquidations: shortLiquidations ?? undefined,
              openInterest: currentOpenInterest ?? undefined,
              openInterestChange: openInterestChange ?? undefined,
            }
          : undefined,

      orderFlow:
        typeof actualBuyRatio === "number" &&
        typeof actualSellRatio === "number"
          ? {
              takerBuyRatio: actualBuyRatio / 100,
              buyVolumeUsd:
                typeof buyVolumeUsd === "number" ? buyVolumeUsd : undefined,
              sellVolumeUsd:
                typeof sellVolumeUsd === "number" ? sellVolumeUsd : undefined,
              buyPressure:
                actualBuyRatio > 52
                  ? ("high" as const)
                  : actualBuyRatio > 48
                    ? ("moderate" as const)
                    : ("low" as const),
              sellPressure:
                actualSellRatio > 52
                  ? ("high" as const)
                  : actualSellRatio > 48
                    ? ("moderate" as const)
                    : ("low" as const),
              netFlow:
                actualBuyRatio > actualSellRatio
                  ? ("bullish" as const)
                  : ("bearish" as const),
            }
          : undefined,

      priceAction:
        volumeTrend && momentum
          ? {
              trend:
                percentChange > 2
                  ? ("uptrend" as const)
                  : percentChange < -2
                    ? ("downtrend" as const)
                    : ("sideways" as const),
              volatility:
                Math.abs(percentChange) > 5
                  ? ("high" as const)
                  : Math.abs(percentChange) > 2
                    ? ("moderate" as const)
                    : ("low" as const),
              volume_profile: volumeTrend as
                | "increasing"
                | "decreasing"
                | "stable",
              priceLevel: "neutral" as const,
              momentum: momentum,
              divergenceSignal: divergence !== "none",
            }
          : undefined,
    };
  };

  // Handle analysis API call
  const handleAnalyze = async () => {
    try {
      setAnalysisResult("");
      stopAnalysis();

      const analysisData = prepareAnalysisData();
      if (!analysisData) {
        setAnalysisResult("Unable to prepare analysis data. Please try again.");
        return;
      }
      await complete(JSON.stringify(analysisData));
    } catch (error) {
      console.error("Analysis failed:", error);
      setAnalysisResult("Failed to generate analysis. Please try again.");
    }
  };

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
  };
}
