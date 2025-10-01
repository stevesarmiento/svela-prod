"use client"

import { useModal } from '../../hooks'
import { Dialog, DialogContent, DialogBackdrop, DialogClose } from '@connectorkit/ui-primitives'
import { modalRoutes } from '../../lib/connector-client'
import type { ConnectorOptions } from '../../types'

// Import wallets page
import { WalletsPage } from '../../pages/wallets'

interface ConnectModalProps {
  options?: Partial<ConnectorOptions>
}

export function ConnectModal({ options = {} }: ConnectModalProps) {
  const modal = useModal()

  const handleClose = () => {
    modal.close()
  }

  return (
    <Dialog open={modal.isOpen && modal.route === modalRoutes.WALLETS} onOpenChange={(open) => !open && handleClose()}>
      <DialogBackdrop />
      <DialogContent 
        style={{ 
          backgroundColor: '#ffffff', 
          borderRadius: 12, 
          border: '1px solid #00000060', 
          overflow: 'hidden', 
          width: 320,
          maxWidth: '90vw'
        }}
      >
        <div style={{ padding: 16, paddingTop: 24, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <DialogClose asChild>
              <button 
                aria-label="Close" 
                type="button" 
                style={{ 
                  background: 'none', border: '1px solid transparent', 
                  width: 32, height: 32, borderRadius: 16, color: '#6b7280', 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', 
                  justifyContent: 'center', fontSize: 18 
                }}
              >
                ×
              </button>
            </DialogClose>
          </div>
          
          <WalletsPage options={options} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
