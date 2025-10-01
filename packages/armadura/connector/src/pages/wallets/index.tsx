"use client"

import React, { useState } from 'react'
import { useConnector } from '../../ui/connector-provider'
import { Spinner } from '../../ui/spinner'
import type { ConnectorOptions } from '../../types'

interface WalletsPageProps {
  options?: Partial<ConnectorOptions>
  onConnectError?: (error: string) => void
}

export function WalletsPage({ options = {}, onConnectError }: WalletsPageProps) {
  const { wallets, connecting, select } = useConnector()
  const [connectingWalletName, setConnectingWalletName] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [unconnectableWalletName, setUnconnectableWalletName] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<'list' | 'help'>('list')

  const connectableWallets = (wallets ?? []).filter((w: any) => w.connectable)
  const unconnectableWallets = (wallets ?? []).filter((w: any) => !w.connectable)

  function getUnconnectableReason(w: any): string {
    try {
      const features = (w?.wallet?.features ?? {}) as Record<string, unknown>
      const chains = (w?.wallet as any)?.chains as unknown as string[] | undefined
      const hasConnect = Boolean(features['standard:connect'])
      const hasDisconnect = Boolean(features['standard:disconnect'])
      const isSolana = Array.isArray(chains) && chains.some(c => typeof c === 'string' && c.includes('solana'))
      const missing: string[] = []
      if (!hasConnect) missing.push('standard:connect')
      if (!hasDisconnect) missing.push('standard:disconnect')
      if (!isSolana) missing.push('solana chain')
      if (missing.length === 0) return 'Unknown limitation'
      return `Unsupported features: ${missing.join(', ')}`
    } catch {
      return 'Wallet is not compatible with Wallet Standard connect/disconnect for Solana.'
    }
  }

  const handleWalletSelect = async (walletName: string) => {
    try {
      setConnectError(null)
      setConnectingWalletName(walletName)
      await select(walletName)
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
          ? error 
          : 'Failed to connect wallet'
      setConnectError(errorMessage)
      onConnectError?.(errorMessage)
    } finally {
      setConnectingWalletName(null)
    }
  }

  if (currentStep === 'help') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button 
            aria-label="Back" 
            type="button" 
            onClick={() => setCurrentStep('list')} 
            style={{ 
              background: 'none', border: '1px solid transparent', width: 32, height: 32, 
              borderRadius: 16, color: '#6b7280', cursor: 'pointer', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0
            }}
          >
            ←
          </button>
          <div style={{ fontSize: 16, color: '#111827', fontWeight: 600 }}>
            {unconnectableWalletName ? 'Wallet not connectable' : 'How to connect a wallet'}
          </div>
        </div>
        
        <div style={{ paddingLeft: 44 }}>
          {unconnectableWalletName ? (
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
              {getUnconnectableReason((wallets ?? []).find((w: any) => w.name === unconnectableWalletName))}
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, color: '#374151', fontSize: 13, lineHeight: 1.5 }}>
              <li>Install a Solana wallet (e.g., Phantom, Backpack).</li>
              <li>Return to this page and click the wallet to connect.</li>
              <li>Approve the connection request in your wallet.</li>
            </ul>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button 
          aria-label="Help" 
          type="button" 
          onClick={() => setCurrentStep('help')} 
          style={{ 
            background: 'none', border: '1px solid transparent', width: 32, height: 32, 
            borderRadius: 16, color: '#6b7280', cursor: 'pointer', display: 'flex', 
            alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0
          }}
        >
          ?
        </button>
        <div>
          <div style={{ fontSize: 18, color: '#111827', fontWeight: 600 }}>Connect Your Wallet</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Select one of your available wallets.</div>
        </div>
      </div>

      {connectError && (
        <div style={{ 
          marginBottom: 12, padding: '8px 12px', borderRadius: 8, 
          background: '#fef2f2', color: '#991b1b', fontSize: 12 
        }}>
          {connectError}
        </div>
      )}

      {(wallets ?? []).length === 0 ? (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          textAlign: 'center', 
          color: '#6b7280', 
          padding: '32px 16px',
          gap: 4
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>No wallets found</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Install a Solana wallet to get started</div>
        </div>
      ) : (
        <>
          {connectableWallets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: unconnectableWallets.length ? 12 : 0 }}>
              {connectableWallets.map((w: any) => (
                <button
                  key={w.name}
                  style={{
                    display: 'flex', height: 44, alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
                    backgroundColor: '#ffffff', cursor: connecting ? 'not-allowed' : 'pointer',
                    opacity: connecting && connectingWalletName !== w.name ? 0.7 : 1,
                    transition: 'background-color 0.2s ease, transform 0.1s ease'
                  }}
                  disabled={Boolean(connecting)}
                  onClick={() => handleWalletSelect(w.name)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.icon} alt={w.name} width={20} height={20} style={{ borderRadius: '50%' }} />
                    <span style={{ fontSize: 14, color: '#111827' }}>{w.name}</span>
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {connecting && connectingWalletName === w.name ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Spinner size={14} color="#9ca3af" speedMs={900} />
                        Connecting…
                      </span>
                    ) : (
                      <>{w.installed ? 'Installed' : 'Not installed'}</>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {unconnectableWallets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unconnectableWallets.map((w: any) => (
                <button
                  key={w.name}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', border: '1px dashed #e5e7eb', borderRadius: 8, 
                    backgroundColor: '#f9fafb', cursor: 'pointer'
                  }}
                  onClick={() => { 
                    setUnconnectableWalletName(w.name) 
                    setCurrentStep('help') 
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.icon} alt={w.name} width={20} height={20} style={{ borderRadius: '50%' }} />
                    <span style={{ fontSize: 14, color: '#6b7280', textDecoration: 'line-through' }}>{w.name}</span>
                  </span>
                  <span aria-hidden style={{ fontSize: 12, color: '#f59e0b' }}>!</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
