"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@v1/ui/skeleton";
import type { CoinMarketData } from "@/types/coins";

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;
    const node = rootRef.current;
    if (!node) return;

    if (typeof IntersectionObserver !== "function") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "250px 0px", threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div
      ref={rootRef}
      className="w-full max-w-56 overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_12%,black_100%)]"
      style={{
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 12%, black 100%)",
        maskImage:
          "linear-gradient(to right, transparent 0%, black 12%, black 100%)",
      }}
    >
      {shouldLoad ? (
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
