export interface SmartScreenerResultGateArgs {
  ok: boolean
  confidence: number
  actionsCount: number
  threshold: number
}

export function shouldApplySmartScreenerResult(args: SmartScreenerResultGateArgs): boolean {
  if (!args.ok) return false
  if (!Number.isFinite(args.confidence)) return false
  if (args.actionsCount <= 0) return false
  return args.confidence >= args.threshold
}

