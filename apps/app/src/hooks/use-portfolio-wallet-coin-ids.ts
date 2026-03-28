import { useQuery } from "@tanstack/react-query"
import { getPortfolioWalletCoinIds } from "@/lib/portfolio-api"

export function usePortfolioWalletCoinIds(walletId?: string) {
  const enabled = Boolean(walletId && walletId.length > 0)

  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolio", "wallet", walletId, "coin-ids"],
    queryFn: async () => {
      if (!walletId) return []
      return await getPortfolioWalletCoinIds(walletId)
    },
    enabled,
    staleTime: 60 * 1000,
  })

  return {
    coinIds: data ?? [],
    isLoading,
    error: (error as Error | null) ?? null,
  }
}

