import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  addPortfolioWallet,
  createPortfolioWalletFromSelection,
  listPortfolioWallets,
  previewPortfolioWalletCandidates,
} from "@/lib/portfolio-api"

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
        queryClient.invalidateQueries({ queryKey: ["watchlists"] }),
      ])
    },
  })

  return {
    addWallet: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  }
}

export function usePreviewPortfolioWalletCandidates() {
  const mutation = useMutation({
    mutationFn: previewPortfolioWalletCandidates,
  })

  return {
    preview: mutation.mutateAsync,
    isPending: mutation.isPending,
    data: mutation.data ?? null,
    error: (mutation.error as Error | null) ?? null,
  }
}

export function useCreatePortfolioWalletFromSelection() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: createPortfolioWalletFromSelection,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
        queryClient.invalidateQueries({ queryKey: ["watchlists"] }),
      ])
    },
  })

  return {
    createWallet: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  }
}

