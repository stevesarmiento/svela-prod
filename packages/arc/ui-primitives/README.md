# @arc/ui-primitives

**Example: Extending Arc with UI Components**

This package demonstrates how Arc can be extended beyond SDK functionality to include UI components. While not currently active, it shows the pattern for building Arc-compatible UI libraries.

## 🎯 Purpose

Shows how to:
- Build framework-agnostic UI components
- Create Arc-themed UI elements
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

// Use with Arc + any framework
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

- `@arc/ui-react` - React-specific components
- `@arc/ui-vue` - Vue components
- `@arc/ui-svelte` - Svelte components
- `@arc/charts` - Solana data visualization

Each UI extension provides consistent patterns for Solana UX.