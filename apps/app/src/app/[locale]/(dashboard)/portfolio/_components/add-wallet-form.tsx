'use client'

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Button } from "@v1/ui/button"
import { Input } from "@v1/ui/input"
import { toast } from "@v1/ui/use-toast"
import { useAddPortfolioWallet } from "@/hooks/use-portfolio-wallets"

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

export interface AddWalletFormRef {
  focusAddress: () => void
}

export interface AddWalletFormProps {
  onSuccess?: () => void
}

export const AddWalletForm = forwardRef<AddWalletFormRef, AddWalletFormProps>(function AddWalletForm(
  props,
  ref,
) {
  const { addWallet, isPending } = useAddPortfolioWallet()

  const addressInputRef = useRef<HTMLInputElement | null>(null)
  const [address, setAddress] = useState("")
  const [name, setName] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  const trimmedAddress = useMemo(() => address.trim(), [address])
  const trimmedName = useMemo(() => name.trim(), [name])

  const focusAddress = useCallback(() => {
    addressInputRef.current?.focus()
  }, [])

  useImperativeHandle(ref, () => ({ focusAddress }), [focusAddress])

  const onSubmit = useCallback(async () => {
    setLocalError(null)

    if (!trimmedAddress) {
      setLocalError("Enter a wallet address.")
      return
    }

    if (!isValidSolanaAddress(trimmedAddress)) {
      setLocalError("That doesn’t look like a valid Solana address.")
      return
    }

    try {
      await addWallet({ address: trimmedAddress, name: trimmedName || undefined })
      setAddress("")
      setName("")
      toast({
        title: "Wallet added",
        description: "Initial sync has been scheduled.",
      })
      props.onSuccess?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add wallet"
      setLocalError(message)
    }
  }, [addWallet, props, trimmedAddress, trimmedName])

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <label htmlFor="portfolio-wallet-address" className="text-sm font-medium">
          Wallet address
        </label>
        <Input
          id="portfolio-wallet-address"
          ref={addressInputRef}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          autoComplete="off"
          inputMode="text"
          spellCheck={false}
        />
        <div className="text-xs text-muted-foreground text-pretty">
          We’ll index the top 100 tokens for this wallet (by USD value) and refresh daily.
        </div>
      </div>

      <div className="grid gap-2">
        <label htmlFor="portfolio-wallet-name" className="text-sm font-medium">
          Label (optional)
        </label>
        <Input
          id="portfolio-wallet-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      </div>

      {localError ? <div className="text-sm text-destructive text-pretty">{localError}</div> : null}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={onSubmit} disabled={isPending}>
          Add wallet
        </Button>
      </div>
    </div>
  )
})

