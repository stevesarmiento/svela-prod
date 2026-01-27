'use client'

import { useMemo } from 'react'
import { Button } from '@v1/ui/button'
import { Card } from '@v1/ui/card'
import { Badge } from '@v1/ui/badge'
import type { TradeAction } from '@/types/enhanced-chat'
import { getTokenInfo } from '@/lib/token-mappings'

interface TradePreviewProps {
  tradeAction: TradeAction
  onExecute?: (signature: string) => void
  onCancel?: () => void
}

export function TradePreview({ tradeAction, onExecute, onCancel }: TradePreviewProps) {
  const inputTokenInfo = useMemo(
    () => getTokenInfo(tradeAction.inputToken ?? ""),
    [tradeAction.inputToken],
  );
  const outputTokenInfo = useMemo(
    () => getTokenInfo(tradeAction.outputToken ?? ""),
    [tradeAction.outputToken],
  );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Trade preview unavailable</div>
          <div className="text-sm text-muted-foreground">
            Wallet trading is temporarily disabled while we upgrade the Solana integration.
          </div>
        </div>
        <Badge className="shrink-0">
          {Math.round(tradeAction.confidence * 100)}% confident
        </Badge>
      </div>

      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">From</span>
          <span className="font-diatype-mono">
            {tradeAction.amount ?? "—"} {inputTokenInfo?.symbol ?? "—"}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-muted-foreground">To</span>
          <span className="font-diatype-mono">{outputTokenInfo?.symbol ?? "—"}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Slippage</span>
          <span className="font-diatype-mono">{tradeAction.slippage ?? "—"}%</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled
          aria-disabled
          title="Trading is temporarily disabled"
        >
          Execute
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Close
        </Button>
        {onExecute ? null : null}
      </div>
    </Card>
  )
}
