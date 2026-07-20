"use client";

import { useVisibleOnce } from "@/hooks/use-visible-once";
import { Skeleton } from "@v1/ui/skeleton";
import dynamic from "next/dynamic";

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
  const { ref, visible } = useVisibleOnce<HTMLDivElement>();

  return (
    <div ref={ref} className="flex min-w-0 w-full items-center justify-end">
      {visible ? (
        <LazyTakerVolumeChart
          baseSymbol={props.baseSymbol}
          className="max-w-56"
        />
      ) : (
        <Skeleton className="h-8 w-full max-w-56 rounded-sm" />
      )}
    </div>
  );
}
