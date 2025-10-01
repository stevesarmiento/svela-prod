# @arma/ui-primitives

**Example: Extending Arma with UI Components**

This package demonstrates how Arma can be extended beyond SDK functionality to include UI components. While not currently active, it shows the pattern for building Arma-compatible UI libraries.

## 🎯 Purpose

Shows how to:
- Build framework-agnostic UI components
- Create Arma-themed UI elements
- Provide consistent UX patterns

## 🏗️ Pattern

```typescript
// Framework-agnostic components
export {
  Dialog,
  DialogTrigger,
  DialogContent,
  TabsRoot,
  TabsList,
  TabsTab,
  TabsPanel
}

// Use with Arma + any framework
import { Dialog } from '@connectorkit/ui-primitives'
import { useWallet } from '@connectorkit/solana'

function WalletDialog() {
  const { wallets, connect } = useWallet()
  
  return (
    <Dialog>
      <DialogTrigger>Connect Wallet</DialogTrigger>
      <DialogContent>
        {wallets.map(w => (
          <button onClick={() => connect(w.name)}>
            {w.name}
          </button>
        ))}
      </DialogContent>
    </Dialog>
  )
}
```

## 🚀 Extension Ideas

- `@arma/ui-react` - React-specific components
- `@arma/ui-vue` - Vue components
- `@arma/ui-svelte` - Svelte components
- `@arma/charts` - Solana data visualization

Each UI extension provides consistent patterns for Solana UX.