import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { addPortfolioWallet, listPortfolioWallets } from "@/lib/portfolio-api"

export function usePortfolioWallets() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolio", "wallets"],
    queryFn: listPortfolioWallets,
  })

  return {
    wallets: data ?? [],
    isLoading,
    error: (error as Error | null) ?? null,
  }
}

export function useAddPortfolioWallet() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: addPortfolioWallet,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portfolio"] })
    },
  })

  return {
    addWallet: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  }
}

