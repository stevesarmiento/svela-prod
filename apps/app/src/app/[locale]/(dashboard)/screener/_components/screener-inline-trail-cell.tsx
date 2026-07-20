"use client";

import { useVisibleOnce } from "@/hooks/use-visible-once";
import type { CoinMarketData } from "@/types/coins";
import { Skeleton } from "@v1/ui/skeleton";
import dynamic from "next/dynamic";

function loadInlineTrailChart() {
  return import("@/components/charts/inline-price-chart");
}

const LazyInlineTrailChart = dynamic(
  () => loadInlineTrailChart().then((module) => module.LazyInlinePriceChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-8 w-full max-w-56 rounded-sm" />,
  },
);

export function ScreenerInlineTrailCell(props: {
  coinId: string;
  symbol: string;
  sparkline7d?: ReadonlyArray<number>;
  initialData: CoinMarketData["quote"]["USD"];
  percentChange24h: number;
}) {
  const { ref, visible } = useVisibleOnce<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className="w-full max-w-56 overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_12%,black_100%)]"
      style={{
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 12%, black 100%)",
        maskImage:
          "linear-gradient(to right, transparent 0%, black 12%, black 100%)",
      }}
    >
      {visible ? (
        <LazyInlineTrailChart
          className="w-full"
          coingeckoId={props.coinId}
          percentChange24h={props.percentChange24h}
          symbol={props.symbol}
          sparkline7d={props.sparkline7d}
          initialData={props.initialData}
          rootMarginPx={400}
        />
      ) : (
        <Skeleton className="h-8 w-full max-w-56 rounded-sm" />
      )}
    </div>
  );
}
