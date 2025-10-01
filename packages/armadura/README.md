# Arma Package

This package contains Web3 and Solana development tools imported and configured for the Svela project.

## Sub-packages

- **connector** (`@armadura/connector`) - Headless wallet connector client and React provider with built-in UI primitives
- **sdk** (`@armadura/sdk`) - React hooks for Solana development with essential hooks for balance, transactions, swaps, etc.
- **jupiter** (`@armadura/jupiter`) - Jupiter aggregator integration for token swaps  
- **providers** (`@armadura/providers`) - Centralized provider registry (Jupiter and future providers)

## Usage

### Via main package exports:

```typescript
// Wallet connection
import { ConnectorProvider, useConnector, ConnectButton } from '@armadura/connector'

// Solana hooks  
import { ArmaProvider, useBalance, useTransaction, useSwap } from '@armadura/sdk'

// Jupiter swaps
import { createJupiter } from '@armadura/jupiter'

// All providers
import { createJupiter, createProviders } from '@armadura/providers'

// UI components
// UI primitives are now included directly in @armadura/connector
```

### Via individual sub-packages:

```typescript
import { ConnectorProvider, useConnector } from '@armadura/connector'
import { useBalance, useSwap } from '@armadura/sdk' 
import { createJupiter } from '@armadura/jupiter'
```

## Development

Build all sub-packages:
```bash
cd packages/arma
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
