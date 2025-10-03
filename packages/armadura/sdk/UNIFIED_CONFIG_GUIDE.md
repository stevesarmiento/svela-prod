# Unified Configuration Guide

This guide explains how to use Armadura SDK's unified configuration system that eliminates duplication and handles network naming conflicts automatically.

## Problem Solved

Previously, setting up Armadura with ConnectorKit required:
- Reading env vars 3 times
- Manually translating network names (`mainnet` ↔ `mainnet-beta`)
- Duplicating app metadata
- Manually wiring connector hooks

```typescript
// ❌ OLD WAY: 81 lines of duplication
const arcConfig = useMemo(() => ({
  network: process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet' | 'devnet',
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || '...',
  providers: [createProvider({ swap: [createJupiter()] })]
}), [])

const connectorConfig = useMemo(() => getDefaultConfig({
  appName: 'My App',
  network: process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet-beta' | 'devnet',
  enableMobile: true
}), [])

const mobile = useMemo(() => getDefaultMobileConfig({
  appName: 'My App',
  network: process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet-beta' | 'devnet',
}), [])

return (
  <AppProvider connectorConfig={connectorConfig} mobile={mobile}>
    <ArmaProvider config={arcConfig} useConnector={useConnectorClient}>
      {children}
    </ArmaProvider>
  </AppProvider>
)
```

## Solution: Unified Config

The new system provides three usage modes:

### 1. Full Integration (ConnectorKit + Armadura)

Single config, auto-detects ConnectorKit, handles network translation automatically.

```typescript
import { UnifiedArmaProvider, createProvider } from '@armadura/sdk'
import { createJupiter } from '@armadura/jupiter'
import { AppProvider, getDefaultConfig } from '@connector-kit/connector'

export function Providers({ children }) {
  // ConnectorKit setup (handles wallet UI)
  const connectorConfig = getDefaultConfig({
    appName: 'My App',
    network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet-beta',
    enableMobile: true
  })

  return (
    <AppProvider connectorConfig={connectorConfig}>
      {/* Armadura auto-detects ConnectorKit */}
      <UnifiedArmaProvider
        network={process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet'}
        providers={[
          createProvider({
            swap: [createJupiter({ slippageBps: 50 })]
          })
        ]}
        useConnector="auto"  // Auto-detect ConnectorKit
      >
        {children}
      </UnifiedArmaProvider>
    </AppProvider>
  )
}
```

**Benefits:**
- ✅ Network names auto-translated (`mainnet` ↔ `mainnet-beta`)
- ✅ Auto-detects ConnectorKit context
- ✅ Zero manual wiring
- ✅ ~30 lines vs 81 lines

### 2. Standalone Armadura (Custom Wallet UI)

Use Armadura without ConnectorKit if you have your own wallet UI.

```typescript
import { UnifiedArmaProvider, createProvider } from '@armadura/sdk'
import { createJupiter } from '@armadura/jupiter'

export function Providers({ children }) {
  return (
    <UnifiedArmaProvider
      network="mainnet"
      rpcUrl="https://api.mainnet-beta.solana.com"
      providers={[
        createProvider({
          swap: [createJupiter({ slippageBps: 50 })]
        })
      ]}
      useConnector={null}  // Standalone mode
    >
      {children}
    </UnifiedArmaProvider>
  )
}
```

**Benefits:**
- ✅ No ConnectorKit dependency
- ✅ Bring your own wallet UI
- ✅ Full protocol feature access

### 3. Manual Connector (Advanced)

Pass your own connector hook for maximum control.

```typescript
import { ArmaProvider, createProvider } from '@armadura/sdk'
import { useConnectorClient } from '@connector-kit/connector'

export function Providers({ children }) {
  return (
    <ArmaProvider
      config={{
        network: 'mainnet',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        providers: [
          createProvider({
            swap: [createJupiter()]
          })
        ]
      }}
      useConnector={useConnectorClient}  // Manual hook
    >
      {children}
    </ArmaProvider>
  )
}
```

## Network Translation

The system automatically handles all network naming conventions:

```typescript
import { normalizeNetwork, toRpcNetwork, toClusterId } from '@armadura/sdk'

// Normalize to standard format
normalizeNetwork('mainnet-beta') // → 'mainnet'
normalizeNetwork('mainnet')      // → 'mainnet'

// Convert to RPC format
toRpcNetwork('mainnet')          // → 'mainnet-beta'
toRpcNetwork('devnet')           // → 'devnet'

// Convert to wallet-ui cluster ID
toClusterId('mainnet')           // → 'solana:mainnet'
toClusterId('devnet')            // → 'solana:devnet'
```

## Programmatic Config Creation

For advanced use cases, create configs programmatically:

```typescript
import { createUnifiedConfig, createArmaConfig } from '@armadura/sdk'

// Create unified config with ConnectorKit
const fullConfig = createUnifiedConfig({
  appName: 'My App',
  network: process.env.NEXT_PUBLIC_SOLANA_NETWORK,
  enableConnector: true,
  enableMobile: true,
  providers: [createProvider({ swap: [createJupiter()] })]
})

// Create Armadura-only config
const armaConfig = createArmaConfig({
  network: 'mainnet',
  providers: [createProvider({ swap: [createJupiter()] })]
})
```

## Migration from Old Pattern

### Before (81 lines)
```typescript
const arcConfig = useMemo(() => ({
  network: process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet',
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || '...',
  providers: [...]
}), [])

const connectorConfig = useMemo(() => getDefaultConfig({
  appName: 'My App',
  network: process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet-beta',
  enableMobile: true
}), [])

const mobile = useMemo(() => getDefaultMobileConfig({
  appName: 'My App',
  network: process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet-beta',
}), [])

return (
  <AppProvider connectorConfig={connectorConfig} mobile={mobile}>
    <ArmaProvider config={arcConfig} useConnector={useConnectorClient}>
      {children}
    </ArmaProvider>
  </AppProvider>
)
```

### After (~30 lines)
```typescript
const connectorConfig = getDefaultConfig({
  appName: 'My App',
  network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet-beta',
  enableMobile: true
})

return (
  <AppProvider connectorConfig={connectorConfig}>
    <UnifiedArmaProvider
      network={process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet'}
      providers={[createProvider({ swap: [createJupiter()] })]}
      useConnector="auto"
    >
      {children}
    </UnifiedArmaProvider>
  </AppProvider>
)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
├─────────────────────────────────────────────────────────────┤
│ UnifiedArmaProvider or ArmaProvider                          │
│   ├─ Network translation (mainnet ↔ mainnet-beta)          │
│   ├─ Auto-detection (optional)                              │
│   └─ Config unification                                      │
├─────────────────────────────────────────────────────────────┤
│              Optional: ConnectorKit Layer                    │
│   ├─ Wallet UI                                              │
│   ├─ Wallet Standard                                         │
│   └─ Mobile Wallet Adapter                                   │
├─────────────────────────────────────────────────────────────┤
│                    Armadura SDK Core                         │
│   ├─ Protocol providers (Jupiter, Kamino, etc.)            │
│   ├─ Transaction building                                    │
│   ├─ RPC management                                          │
│   └─ React hooks                                             │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

✅ **Single network config** - Define network once, auto-translated everywhere  
✅ **Auto-detection** - ConnectorKit auto-detected when available  
✅ **Standalone mode** - Works without ConnectorKit  
✅ **Zero duplication** - App metadata, network, RPC defined once  
✅ **Type-safe** - Full TypeScript support with proper inference  
✅ **Backward compatible** - Old patterns still work

## API Reference

### `UnifiedArmaProvider`

Main provider component with unified config.

**Props:**
- `network?: string` - Network to connect to (mainnet, devnet, testnet, localnet)
- `rpcUrl?: string` - Custom RPC URL (overrides network default)
- `providers?: Provider[]` - Armadura protocol providers
- `useConnector?: 'auto' | ConnectorHook | null` - Connector mode
- `autoConnect?: boolean` - Enable automatic reconnection
- `debug?: boolean` - Enable debug logging
- `queryClient?: QueryClient` - React Query client

### `createUnifiedConfig(options)`

Create a unified config programmatically.

**Returns:** `UnifiedConfig` with separate armadura, connector, and mobile configs

### Network Utilities

- `normalizeNetwork(network)` - Normalize to standard format
- `toRpcNetwork(network)` - Convert to RPC format
- `toClusterId(network)` - Convert to cluster ID format
- `getDefaultRpcUrl(network)` - Get default RPC URL
- `isMainnet(network)` - Check if mainnet
- `isDevnet(network)` - Check if devnet
- `isTestnet(network)` - Check if testnet
- `isLocalnet(network)` - Check if localnet

## Testing

The system supports three testing scenarios:

### 1. With ConnectorKit
```typescript
<AppProvider connectorConfig={...}>
  <UnifiedArmaProvider useConnector="auto" network="devnet">
    {children}
  </UnifiedArmaProvider>
</AppProvider>
```

### 2. Without ConnectorKit
```typescript
<UnifiedArmaProvider useConnector={null} network="devnet">
  {children}
</UnifiedArmaProvider>
```

### 3. Custom Wallet UI
```typescript
<UnifiedArmaProvider useConnector={customHook} network="devnet">
  {children}
</UnifiedArmaProvider>
```

