# Arc Package

This package contains Web3 and Solana development tools imported and configured for the Svela project.

## Sub-packages

- **connector** (`@v1/arc-connector`) - Headless wallet connector client and React provider built on Wallet Standard
- **sdk** (`@v1/arc-sdk`) - React hooks for Solana development with essential hooks for balance, transactions, swaps, etc.
- **jupiter** (`@v1/arc-jupiter`) - Jupiter aggregator integration for token swaps  
- **providers** (`@v1/arc-providers`) - Centralized provider registry (Jupiter and future providers)
- **ui-primitives** (`@v1/arc-ui-primitives`) - Framework-agnostic, SSR-safe UI primitive components

## Usage

### Via main package exports:

```typescript
// Wallet connection
import { ConnectorProvider, useConnector, ConnectButton } from '@v1/arc/connector'

// Solana hooks  
import { ArcProvider, useBalance, useTransaction, useSwap } from '@v1/arc/sdk'

// Jupiter swaps
import { createJupiter } from '@v1/arc/jupiter'

// All providers
import { createJupiter, createProviders } from '@v1/arc/providers'

// UI components
import { Dialog, DropdownRoot, TabsRoot } from '@v1/arc/ui-primitives'
```

### Via individual sub-packages:

```typescript
import { ConnectorProvider, useConnector } from '@v1/arc-connector'
import { useBalance, useSwap } from '@v1/arc-sdk' 
import { createJupiter } from '@v1/arc-jupiter'
```

## Development

Build all sub-packages:
```bash
cd packages/arc
npm run build
```

Watch mode for development:
```bash
npm run dev
```

Each sub-package has:
- TypeScript configuration with composite builds
- tsup build configuration 
- Proper workspace dependencies
- Individual build/dev scripts

## Architecture

- **ui-primitives**: Base layer - framework-agnostic components
- **connector**: Wallet connection layer - depends on ui-primitives  
- **sdk**: Core Solana hooks - depends on connector
- **jupiter**: Swap provider - depends on sdk
- **providers**: Aggregation layer - depends on jupiter and other future providers

The packages are designed to work together but can also be used independently.
