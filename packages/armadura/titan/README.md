# @armadura/titan

Titan DEX aggregator provider for Armadura SDK.

## Features

- **Real-time WebSocket quotes** - Continuous quote updates via WebSocket
- **Multiple providers** - Access DEX aggregators + RFQ providers (Pyth Express, Hashflow)
- **JWT Authentication** - Secure API access with token authentication
- **MessagePack encoding** - Efficient binary protocol
- **Stream management** - Automatic connection pooling and stream lifecycle
- **Quote strategies** - Best price, lowest fees, or fastest execution

## Installation

```bash
npm install @armadura/titan
# or
pnpm add @armadura/titan
```

## Usage

### Basic Setup

```typescript
import { createTitan } from '@armadura/titan'

const titan = createTitan({
  apiKey: process.env.TITAN_API_KEY, // Or omit if TITAN_API_KEY env var is set
  slippageBps: 50,
  strategy: 'best-price'
})

// Get a quote
const quote = await titan.quote({
  inputMint: 'So11111111111111111111111111111111111111112', // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  amount: BigInt(1_000_000_000) // 1 SOL
})

console.log('Output:', quote.outputAmount)
console.log('Provider:', quote.provider)
console.log('Price impact:', quote.priceImpact)
```

### With Armadura SDK

```typescript
import { createConfig } from '@armadura/sdk'
import { createTitan } from '@armadura/titan'

const config = createConfig({
  cluster: 'mainnet-beta',
  providers: {
    swap: [createTitan({
      apiKey: process.env.TITAN_API_KEY,
      strategy: 'best-price'
    })]
  }
})
```

### Advanced Configuration

```typescript
const titan = createTitan({
  apiKey: process.env.TITAN_API_KEY,
  apiUrl: 'wss://api.titan.ag/api/v1/ws', // Custom endpoint
  compression: 'zstd', // Enable compression
  slippageBps: 100, // 1% slippage
  intervalMs: 500, // Quote update interval
  numQuotes: 5, // Max quotes per update
  strategy: 'lowest-fees', // Quote selection strategy
  excludeDexes: ['Raydium'], // Exclude specific DEXes
  providers: ['jupiter', 'pyth'], // Limit to specific providers
  onlyDirectRoutes: true, // Only direct swaps
  debug: true // Enable debug logging
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | `process.env.TITAN_API_KEY` | Titan API key (required) |
| `apiUrl` | string | `wss://api.titan.ag/api/v1/ws` | WebSocket endpoint |
| `compression` | `'zstd' \| 'brotli' \| 'gzip' \| 'none'` | `'none'` | Protocol compression |
| `slippageBps` | number | `50` | Slippage tolerance in basis points |
| `intervalMs` | number | Server default | Quote update interval (ms) |
| `numQuotes` | number | Server default | Max quotes per update |
| `strategy` | `'best-price' \| 'lowest-fees' \| 'fastest'` | `'best-price'` | Quote selection strategy |
| `excludeDexes` | string[] | - | DEXes to exclude |
| `providers` | string[] | - | Limit to specific provider IDs |
| `onlyDirectRoutes` | boolean | `false` | Only direct token swaps |
| `addSizeConstraint` | boolean | - | Enforce transaction size limits |
| `quoteTimeoutMs` | number | `10000` | Quote request timeout |
| `debug` | boolean | `false` | Enable debug logging |

## Helper Functions

### Get Available Venues

```typescript
import { getTitanVenues } from '@armadura/titan'

const venues = await getTitanVenues()
console.log('Available DEXes:', venues)
// ['Raydium', 'Orca', 'Phoenix', ...]
```

### Get Provider Information

```typescript
import { getTitanProviders } from '@armadura/titan'

const providers = await getTitanProviders()
console.log(providers)
// [
//   { id: 'jupiter', name: 'Jupiter', kind: 'DexAggregator' },
//   { id: 'pyth', name: 'Pyth Express', kind: 'RFQ' },
//   ...
// ]
```

## Differences from Jupiter Provider

| Feature | Jupiter | Titan |
|---------|---------|-------|
| Protocol | REST HTTP | WebSocket |
| Authentication | None | JWT required |
| Quotes | One-off requests | Real-time streams |
| Encoding | JSON | MessagePack |
| Providers | Jupiter only | Multiple (Jupiter, Pyth, etc.) |
| RFQ Support | No | Yes |

## Environment Variables

Set your Titan API key in your environment:

```bash
TITAN_API_KEY=your_jwt_token_here
```

Contact info@titandex.io for API access.

## License

MIT
