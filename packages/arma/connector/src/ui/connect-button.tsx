"use client"

import React, { memo, useEffect, useMemo, useState } from 'react'
import { useConnector } from './connector-provider'
import { useModal } from '../hooks'
import {
  DropdownRoot,
  DropdownTrigger,
  DropdownContent,
  DropdownItem
} from '@connectorkit/ui-primitives'
import { ConnectModal } from './connect-modal'

import {
  type ConnectorTheme,
  type LegacyConnectorTheme as LegacyThemeInterface,
  legacyToModernTheme,
  getButtonHeight,
  getButtonShadow,
  getButtonBorder,
  getBorderRadius,
  getAccessibleTextColor,
  minimalTheme
} from '../themes'
import type { ConnectorOptions } from '../types'
import { Spinner } from './spinner'

export interface ConnectButtonProps {
  className?: string
  style?: React.CSSProperties
  variant?: 'default' | 'icon-only'
  theme?: ConnectorTheme | Partial<ConnectorTheme> | Partial<LegacyThemeInterface>
  label?: string
  options?: Partial<ConnectorOptions>
}

export const ConnectButton = memo<ConnectButtonProps>(({ className, style, variant = 'default', theme = {}, label, options = {} }) => {
  // SSR hydration safety - prevent hydration mismatches
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Stabilize options to prevent infinite re-renders from object recreation
  const stableOptions = useMemo(() => options, [
    options.autoCloseOnConnect,
    options.truncateAddress,
    options.reduceMotion,
    options.hideTooltips,
    options.showQRCode,
    options.hideWalletIcons,
    options.walletCTA,
    options.avoidLayoutShift,
    options.hideNotInstalledBadge,
    options.walletOnboardingUrl,
    options.disableAutoRoute,
    options.debugMode,
    options.disclaimer,
    options.overlayBlur
  ])

  // Handle both legacy and modern theme formats
  const normalizedTheme = useMemo(() => {
    if (!theme || Object.keys(theme).length === 0) {
      return minimalTheme
    }
    
    // Check if it's a legacy theme format
    if ('primaryColor' in theme || 'secondaryColor' in theme || 'fontFamily' in theme) {
      const legacyTheme = {
        primaryColor: '#111827',
        secondaryColor: '#374151',
        borderRadius: 8,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        buttonShadow: 'md' as const,
        border: '1px solid #e5e7eb',
        height: 44,
        ...theme
      } as LegacyThemeInterface
      return legacyToModernTheme(legacyTheme)
    }
    
    // Check if it's already a modern theme
    if ('colors' in theme && 'fonts' in theme) {
      return theme as ConnectorTheme
    }
    
    // It's partial modern theme overrides
    return {
      ...minimalTheme,
      ...theme,
      colors: { ...minimalTheme.colors, ...((theme as any).colors || {}) },
      fonts: { ...minimalTheme.fonts, ...((theme as any).fonts || {}) },
      borderRadius: { ...minimalTheme.borderRadius, ...((theme as any).borderRadius || {}) },
      shadows: { ...minimalTheme.shadows, ...((theme as any).shadows || {}) },
      spacing: { ...minimalTheme.spacing, ...((theme as any).spacing || {}) },
      button: { ...minimalTheme.button, ...((theme as any).button || {}) },
    } as ConnectorTheme
  }, [theme])
  
  const t = normalizedTheme
  const { wallets, connected, disconnect, selectedAccount, accounts, selectAccount, selectedWallet } = useConnector()
  const modal = useModal()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    if (connected) {
      // Respect autoCloseOnConnect option (default: true)
      if (stableOptions.autoCloseOnConnect !== false) {
        modal.close()
      }
    }
  }, [connected, stableOptions.autoCloseOnConnect, modal.close])

  const selectedDisplay = useMemo(() => {
    if (!selectedAccount) return null
    const truncateLength = stableOptions.truncateAddress ?? 4
    return `${String(selectedAccount).slice(0, truncateLength)}...${String(selectedAccount).slice(-truncateLength)}`
  }, [selectedAccount, stableOptions.truncateAddress])

  const isIconOnly = variant === 'icon-only'

  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)

  // Move all remaining hooks here BEFORE the conditional return
  const buttonStyles: React.CSSProperties = useMemo(() => ({
    padding: isIconOnly ? '0.75rem' : '0.75rem 1.5rem',
    height: getButtonHeight(t),
    backgroundColor: isHovered ? t.colors.secondary : t.colors.primary,
    color: getAccessibleTextColor(isHovered ? t.colors.secondary : t.colors.primary),
    border: getButtonBorder(t),
    borderRadius: getBorderRadius(t),
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: isIconOnly ? 0 : '0.5rem',
    boxShadow: isHovered
      ? `${getButtonShadow(t)}, 0 0 0 4px rgba(202, 202, 202, 0.45)`
      : getButtonShadow(t),
    transform: isPressed && !stableOptions.reduceMotion ? 'scale(0.97)' : 'scale(1)',
    transition: stableOptions.reduceMotion ? 'none' : 'background-color 0.2s ease, box-shadow 0.2s ease, transform 0.05s ease',
    fontFamily: t.fonts.body,
    minWidth: isIconOnly ? '44px' : 'auto',
    aspectRatio: isIconOnly ? '1' : 'auto',
    outlineOffset: 2,
    ...style,
  }), [isIconOnly, isHovered, isPressed, t, style, stableOptions.reduceMotion])

  // Removed connectableWallets and unconnectableWallets - now handled in WalletsPage

  const selectedAccountInfo = useMemo(() => {
    if (!selectedAccount) return null
    return (accounts ?? []).find((a: any) => a.address === selectedAccount) ?? null
  }, [accounts, selectedAccount])

  const selectedWalletIcon = useMemo(() => {
    if (selectedAccountInfo?.icon) return selectedAccountInfo.icon
    if (!selectedWallet) return null
    const match = (wallets ?? []).find((w: any) => w.wallet === selectedWallet)
    return match?.icon ?? null
  }, [selectedAccountInfo, selectedWallet, wallets])

  // Prevent SSR hydration mismatches by not rendering until mounted
  if (!isMounted) {
    return (
      <button
        className={className}
        style={{
          padding: isIconOnly ? '0.75rem' : '0.75rem 1.5rem',
          height: 44,
          backgroundColor: '#f3f4f6',
          color: '#6b7280',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          fontSize: '1rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: isIconOnly ? 0 : '0.5rem',
          minWidth: isIconOnly ? '44px' : 'auto',
          aspectRatio: isIconOnly ? '1' : 'auto',
          ...style,
        }}
        disabled
        aria-label={isIconOnly ? (label || 'Connect Wallet') : undefined}
      >
        {isIconOnly ? null : (label || 'Connect Wallet')}
      </button>
    )
  }

  const icon = (
    <svg width="18" height="14" viewBox="0 0 21 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M3.98967 11.7879C4.10222 11.6755 4.25481 11.6123 4.41392 11.6123H19.0941C19.3615 11.6123 19.4954 11.9357 19.3062 12.1247L16.4054 15.0232C16.2929 15.1356 16.1403 15.1988 15.9812 15.1988H1.30102C1.03359 15.1988 0.899716 14.8754 1.08889 14.6864L3.98967 11.7879Z" fill="currentColor"/>
      <path d="M3.98937 0.959506C4.10191 0.847047 4.25451 0.783875 4.41361 0.783875H19.0938C19.3612 0.783875 19.4951 1.10726 19.3059 1.29628L16.4051 4.19475C16.2926 4.30721 16.14 4.37038 15.9809 4.37038H1.30071C1.03329 4.37038 0.899411 4.047 1.08859 3.85797L3.98937 0.959506Z" fill="currentColor"/>
      <path d="M16.4054 6.33924C16.2929 6.22675 16.1403 6.16362 15.9812 6.16362H1.30102C1.03359 6.16362 0.899717 6.48697 1.08889 6.676L3.98967 9.57445C4.10222 9.68694 4.25481 9.75012 4.41392 9.75012H19.0941C19.3615 9.75012 19.4954 9.42673 19.3062 9.23769L16.4054 6.33924Z" fill="currentColor"/>
    </svg>
  )

  // getUnconnectableReason function moved to WalletsPage

  if (connected) {
    return (
      <DropdownRoot open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownTrigger asChild>
          <button
            className={className}
            style={{ ...buttonStyles, position: 'relative' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsPressed(false) }}
            onMouseDown={() => setIsPressed(true)}
            onMouseUp={() => setIsPressed(false)}
            onFocus={() => setIsHovered(true)}
            onBlur={() => setIsHovered(false)}
            type="button"
            aria-label={isIconOnly ? (selectedDisplay || label || 'Wallet') : undefined}
          >
            {selectedWalletIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedWalletIcon} alt="Account" width={18} height={18} style={{ borderRadius: 9 }} />
            ) : (
              icon
            )}
            {!isIconOnly && (selectedDisplay || label || 'Wallet')}
          </button>
        </DropdownTrigger>
        <DropdownContent align="end">
          <div
            style={{
              minWidth: 240,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              backgroundColor: '#ffffff',
              padding: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
              textAlign: 'left'
            }}
          >
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280' }}>Account</div>
            <div style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'monospace', color: '#111827' }}>{selectedDisplay}</div>
            {(accounts ?? []).length > 1 ? (
              <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 8 }}>
                <div style={{ padding: '4px 12px', fontSize: 12, color: '#6b7280' }}>Accounts</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {(accounts ?? []).map((acc: any) => (
                    <button
                      key={acc.address}
                      onClick={() => selectAccount(acc.address)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 6,
                        color: acc.address === selectedAccount ? '#111827' : '#374151'
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {acc.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={acc.icon} alt="" width={16} height={16} style={{ borderRadius: 8 }} />
                        ) : null}
                        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {String(acc.address).slice(0, 8)}...{String(acc.address).slice(-4)}
                        </span>
                      </span>
                      <span aria-hidden>{acc.address === selectedAccount ? '●' : '○'}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedWallet?.name && (
              <DropdownItem onSelect={() => modal.openWallets()}>
                <div style={{ padding: '8px 12px', fontSize: 13, color: '#111827', borderRadius: 6, cursor: 'pointer' }}>
                  Connect More
                </div>
              </DropdownItem>
            )}
              <DropdownItem onSelect={async (_e) => { 
                try {
                    modal.close();
                    await disconnect()
                } catch (error) {
                    // Reset state to ensure clean disconnection flow
                    modal.close();
                    // Consider showing a toast or notification to the user
                    console.error('Failed to disconnect wallet:', error);
                }
            }}>
              <div style={{ padding: '8px 12px', fontSize: 13, color: '#dc2626', borderRadius: 6, cursor: 'pointer' }}>
                Disconnect
              </div>
            </DropdownItem>
          </div>
        </DropdownContent>
      </DropdownRoot>
    )
  }

  return (
    <>
      <button
        className={className}
        style={buttonStyles}
        onClick={() => modal.openWallets()}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setIsPressed(false) }}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
        type="button"
        aria-label={isIconOnly ? (label || 'Connect Wallet') : undefined}
      >
        {icon}
        {!isIconOnly && (label || 'Connect Wallet')}
      </button>
      
      <ConnectModal options={stableOptions} />
    </>
  )
})

ConnectButton.displayName = 'ConnectButton'


