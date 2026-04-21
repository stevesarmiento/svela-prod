"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@v1/ui/skeleton";

function loadTakerVolumeChart() {
  return import("@/components/charts/inline-spot-taker-buy-sell-volume-chart");
}

const LazyTakerVolumeChart = dynamic(
  () =>
    loadTakerVolumeChart().then(
      (module) => module.InlineSpotTakerBuySellVolumeChart,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-8 w-full max-w-56 rounded-sm" />,
  },
);

export function ScreenerTakerVolumeCell(props: { baseSymbol: string }) {
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
    <div ref={rootRef} className="flex min-w-0 w-full items-center justify-end">
      {shouldLoad ? (
        <LazyTakerVolumeChart baseSymbol={props.baseSymbol} className="max-w-56" />
      ) : (
        <Skeleton className="h-8 w-full max-w-56 rounded-sm" />
      )}
    </div>
  );
}
