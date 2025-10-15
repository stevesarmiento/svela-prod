/**
 * Titan API Types
 * Based on Titan Swap API v1 specification
 */

// ===== Common Types =====

export type Pubkey = Uint8Array

export interface AccountMeta {
  p: Pubkey  // public key
  s: boolean // is_signer
  w: boolean // is_writable
}

export interface Instruction {
  p: Pubkey           // program_id
  a: AccountMeta[]    // accounts
  d: Uint8Array       // data
}

export enum SwapMode {
  ExactIn = 'ExactIn',
  ExactOut = 'ExactOut'
}

// ===== Request Types =====

export interface SwapParams {
  inputMint: string
  outputMint: string
  amount: string
  swapMode?: SwapMode
  slippageBps?: number
  dexes?: string[]
  excludeDexes?: string[]
  onlyDirectRoutes?: boolean
  addSizeConstraint?: boolean
  sizeConstraint?: number
  providers?: string[]
  accountsLimitTotal?: number
  accountsLimitWritable?: number
}

export interface TransactionParams {
  userPublicKey: string
  closeInputTokenAccount?: boolean
  createOutputTokenAccount?: boolean
  feeAccount?: string
  feeBps?: number
  feeFromInputMint?: boolean
  outputAccount?: string
}

export interface QuoteUpdateParams {
  intervalMs?: number
  numQuotes?: number
}

export interface SwapQuoteRequest {
  swap: SwapParams
  transaction: TransactionParams
  update?: QuoteUpdateParams
}

export interface GetInfoRequest {}

export interface StopStreamRequest {
  id: number
}

export interface GetVenuesRequest {
  includeProgramIds?: boolean
}

export interface ListProvidersRequest {
  includeIcons?: boolean
}

export type RequestData =
  | { GetInfo: GetInfoRequest }
  | { NewSwapQuoteStream: SwapQuoteRequest }
  | { StopStream: StopStreamRequest }
  | { GetVenues: GetVenuesRequest }
  | { ListProviders: ListProvidersRequest }

export interface ClientRequest {
  id: number
  data: RequestData
}

// ===== Response Types =====

export interface VersionInfo {
  major: number
  minor: number
  patch: number
}

export interface QuoteUpdateSettings {
  intervalMs: { min: number; max: number; default: number }
  numQuotes: { min: number; max: number; default: number }
}

export interface SwapSettings {
  slippageBps: { min: number; max: number; default: number }
  onlyDirectRoutes: boolean
  addSizeConstraint: boolean
}

export interface TransactionSettings {
  closeInputTokenAccount: boolean
  createOutputTokenAccount: boolean
}

export interface ConnectionSettings {
  concurrentStreams: number
}

export interface ServerSettings {
  quoteUpdate: QuoteUpdateSettings
  swap: SwapSettings
  transaction: TransactionSettings
  connection: ConnectionSettings
}

export interface ServerInfo {
  protocolVersion: VersionInfo
  settings: ServerSettings
}

export interface QuoteSwapStreamResponse {
  intervalMs: number
}

export interface StopStreamResponse {
  id: number
}

export interface VenueInfo {
  labels: string[]
  programIds?: Pubkey[]
}

export type ProviderKind = 'DexAggregator' | 'RFQ'

export interface ProviderInfo {
  id: string
  name: string
  kind: ProviderKind
  iconUri48?: string
}

export type ResponseData =
  | { GetInfo: ServerInfo }
  | { NewSwapQuoteStream: QuoteSwapStreamResponse }
  | { StreamStopped: StopStreamResponse }
  | { GetVenues: VenueInfo }
  | { ListProviders: ProviderInfo[] }

export enum StreamDataType {
  SwapQuotes = 'SwapQuotes'
}

export interface StreamStart {
  id: number
  dataType: StreamDataType
}

export interface ResponseSuccess {
  requestId: number
  data: ResponseData
  stream?: StreamStart
}

export interface ResponseError {
  requestId: number
  code: number
  message: string
}

// ===== Stream Data Types =====

export interface RoutePlanStep {
  ammKey: Pubkey
  label: string
  inputMint: Pubkey
  outputMint: Pubkey
  inAmount: number
  outAmount: number
  allocPpb: number
  feeMint?: Pubkey
  feeAmount?: number
  contextSlot?: number
}

export interface PlatformFee {
  amount: number
  feeBps: number
}

export interface SwapRoute {
  inAmount: number
  outAmount: number
  slippageBps: number
  platformFee?: PlatformFee
  steps: RoutePlanStep[]
  instructions: Instruction[]
  addressLookupTables: Pubkey[]
  contextSlot?: number
  timeTakenNs?: number
  expiresAtMs?: number
  expiresAfterSlot?: number
  computeUnits?: number
  computeUnitsSafe?: number
  transaction?: Uint8Array
  referenceId?: string
}

export interface SwapQuotes {
  id: string
  inputMint: Pubkey
  outputMint: Pubkey
  swapMode: SwapMode
  amount: number
  quotes: Record<string, SwapRoute>
}

export type StreamDataPayload = { SwapQuotes: SwapQuotes }

export interface StreamData {
  id: number
  seq: number
  payload: StreamDataPayload
}

export interface StreamEnd {
  id: number
  errorCode?: number
  errorMessage?: string
}

export type ServerMessage =
  | { Response: ResponseSuccess }
  | { Error: ResponseError }
  | { StreamData: StreamData }
  | { StreamEnd: StreamEnd }
