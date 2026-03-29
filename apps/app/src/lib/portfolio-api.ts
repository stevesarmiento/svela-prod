import { z } from "zod"

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

const PortfolioWalletSchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  userId: z.string(),
  address: z.string(),
  name: z.string().optional(),
  isActive: z.boolean(),
  lastSyncedAt: z.number().optional(),
  lastSyncError: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const WalletListSchema = z.array(PortfolioWalletSchema)

const AddWalletResponseSchema = z.object({ id: z.string() })

const CoinIdsResponseSchema = z.object({ coinIds: z.array(z.string()) })
const DeleteWalletResponseSchema = z.object({ success: z.boolean() })

const PortfolioWalletCandidateSchema = z.object({
  mint: z.string(),
  coingeckoId: z.string(),
})

const PreviewWalletResponseSchema = z.object({
  candidates: z.array(PortfolioWalletCandidateSchema),
  unresolvedCount: z.number(),
})

function getErrorMessage(body: unknown): string | null {
  if (!body) return null
  if (typeof body === "string") return body
  if (typeof body !== "object") return null

  const record = body as Record<string, unknown>
  if (typeof record.error === "string") return record.error
  if (typeof record.message === "string") return record.message
  if (typeof record.details === "string") return record.details
  return null
}

async function parseJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "")
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function requestJson<T>(args: {
  endpoint: string
  init?: RequestInit
  parse: (data: unknown) => T
}): Promise<T> {
  const response = await fetch(args.endpoint, args.init)
  const body = await parseJsonOrText(response)

  if (!response.ok) {
    const message = getErrorMessage(body) ?? `Request failed: ${response.status}`
    throw new Error(message)
  }

  return args.parse(body)
}

export async function listPortfolioWallets(): Promise<Array<PortfolioWallet>> {
  return await requestJson({
    endpoint: "/api/internal/portfolio/wallets",
    parse: (data) => WalletListSchema.parse(data),
  })
}

export async function addPortfolioWallet(input: {
  address: string
  name?: string
}): Promise<{ id: string }> {
  return await requestJson({
    endpoint: "/api/internal/portfolio/wallets",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, selected: [] }),
    },
    parse: (data) => AddWalletResponseSchema.parse(data),
  })
}

export async function previewPortfolioWalletCandidates(address: string): Promise<{
  candidates: Array<PortfolioWalletCandidate>
  unresolvedCount: number
}> {
  const result = await requestJson({
    endpoint: "/api/internal/portfolio/wallets/preview",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    },
    parse: (data) => PreviewWalletResponseSchema.parse(data),
  })
  return { candidates: result.candidates, unresolvedCount: result.unresolvedCount }
}

export async function createPortfolioWalletFromSelection(input: {
  address: string
  name?: string
  selected: Array<PortfolioWalletCandidate>
}): Promise<{ id: string }> {
  return await requestJson({
    endpoint: "/api/internal/portfolio/wallets",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    parse: (data) => AddWalletResponseSchema.parse(data),
  })
}

export async function getPortfolioWalletCoinIds(walletId: string): Promise<Array<string>> {
  const result = await requestJson({
    endpoint: `/api/internal/portfolio/wallets/${encodeURIComponent(walletId)}/coin-ids`,
    parse: (data) => CoinIdsResponseSchema.parse(data),
  })
  return result.coinIds
}

export async function deletePortfolioWallet(walletId: string): Promise<void> {
  await requestJson({
    endpoint: `/api/internal/portfolio/wallets/${encodeURIComponent(walletId)}`,
    init: {
      method: "DELETE",
    },
    parse: (data) => DeleteWalletResponseSchema.parse(data),
  })
}

