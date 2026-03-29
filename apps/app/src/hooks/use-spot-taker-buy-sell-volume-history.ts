import { useQuery } from "@tanstack/react-query";

export interface TakerBuySellVolumeHistoryPoint {
  time: number;
  takerBuyVolumeUsd: number;
  takerSellVolumeUsd: number;
}

export interface TakerBuySellVolumeHistoryCombinedResponse {
  success: boolean;
  exchange: string;
  symbol: string;
  interval: string;
  limit: number;
  spot: TakerBuySellVolumeHistoryPoint[];
  futures: TakerBuySellVolumeHistoryPoint[];
  lastUpdated: { spot: number; futures: number };
  stale: { spot: boolean; futures: boolean };
}

interface UseSpotTakerBuySellVolumeHistoryProps {
  exchange?: string;
  symbol: string;
  interval?: string;
  limit?: number;
  enabled?: boolean;
}

export function useSpotTakerBuySellVolumeHistory({
  exchange = "Binance",
  symbol,
  interval = "4h",
  limit = 42,
  enabled,
}: UseSpotTakerBuySellVolumeHistoryProps) {
  const isEnabled = (enabled ?? true) && symbol.length > 0 && exchange.length > 0;

  return useQuery({
    queryKey: ["spotTakerBuySellVolumeHistory", exchange, symbol, interval, limit],
    queryFn: async (): Promise<TakerBuySellVolumeHistoryCombinedResponse> => {
      const url = new URL("/api/coinglass/taker-buy-sell-volume/history", window.location.origin);
      url.searchParams.set("exchange", exchange);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("interval", interval);
      url.searchParams.set("limit", String(limit));

      const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Request failed (${response.status}): ${text.slice(0, 200)}`);
      }

      return (await response.json()) as TakerBuySellVolumeHistoryCombinedResponse;
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}

