export interface PortfolioWallet {
  _id: string
  _creationTime: number
  userId: string
  address: string
  name?: string
  isActive: boolean
  lastSyncedAt?: number
  lastSyncError?: string
  createdAt: number
  updatedAt: number
}

export interface PortfolioWalletCandidate {
  mint: string
  coingeckoId: string
}
