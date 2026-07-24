"use client";

import { useAnalyzeSelection } from "@/hooks/use-analyze-selection";
import {
  useBottomNavSelectionBridge,
  useWatchlistSelection,
} from "@/hooks/use-watchlist-selection";
import { cleanTokenName, getTokenLogoURL } from "@/lib/logo-overrides";
import type { CoinMarketData } from "@/types/coins";
import {
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import type React from "react";
import { createScreenerColumns } from "./screener-columns";
import { ScreenerTableBody } from "./screener-table-body";
import type {
  ScreenerTableMeta,
  ScreenerTableStatus,
} from "./screener-table-types";

function isPriced(coin: CoinMarketData): boolean {
  const price = coin.quote.USD.price;
  return price != null && price > 0;
}

export function ScreenerTableSection({
  coins,
  sorting,
  onSortingChange,
  status = null,
  tokenHeaderCountBadge = null,
}: {
  coins: Array<CoinMarketData>;
  sorting: SortingState;
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  status?: ScreenerTableStatus | null;
  tokenHeaderCountBadge?: { count: number } | null;
}) {
  const columns = useMemo(() => createScreenerColumns(), []);
  const meta = useMemo<ScreenerTableMeta>(
    () => ({ tokenHeaderCountBadge }),
    [tokenHeaderCountBadge],
  );

  const table = useReactTable({
    data: coins,
    columns,
    meta,
    getRowId: (row) => row.id.toString(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange,
    state: { sorting },
  });

  // Row multi-selection for the bottom-nav dock. The screener is read-only —
  // no removeSelected — so the dock shows Analyze without Remove.
  const selection = useWatchlistSelection({});
  const { selectedCoins, handleCoinSelect, hasSelectedCoins } = selection;

  const selectableCoinIds = useMemo(
    () => coins.flatMap((coin) => (isPriced(coin) ? [String(coin.id)] : [])),
    [coins],
  );

  const getSelectedTokens = useCallback(
    () =>
      coins.flatMap((coin) =>
        isPriced(coin) && selectedCoins.has(String(coin.id))
          ? [
              {
                id: String(coin.id),
                name: cleanTokenName(coin.name),
                symbol: coin.symbol,
                logoUrl: getTokenLogoURL(coin.symbol, coin.image),
              },
            ]
          : [],
      ),
    [coins, selectedCoins],
  );
  const { onAnalyzeSelected, analyzeDialog } =
    useAnalyzeSelection(getSelectedTokens);

  useBottomNavSelectionBridge(selection, selectableCoinIds, {
    onAnalyzeSelected,
    analyzeSelectedCount: selectedCoins.size,
  });

  return (
    <>
      <ScreenerTableBody
        table={table}
        status={status}
        selectedCoins={selectedCoins}
        hasSelectedCoins={hasSelectedCoins}
        onCoinSelect={handleCoinSelect}
      />
      {analyzeDialog}
    </>
  );
}
