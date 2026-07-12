# Svela

Crypto market-intelligence dashboard: real-time prices, derivatives data, screeners, watchlists, portfolios, and AI-assisted analysis.

Originally bootstrapped from the [midday-ai/v1](https://github.com/midday-ai/v1) starter kit; the boilerplate has since been pruned.

## Monorepo layout

| Path | What it is |
|---|---|
| `apps/app` | The Svela dashboard (Next.js). Backend lives in `apps/app/convex/` (Convex: CoinGecko/Coinglass ingestion, crons, portfolios, watchlists, users). Auth via Clerk + Solana wallet sign-in. |
| `apps/web` | Marketing site (Next.js) — early placeholder, includes `/talk-to-us` Cal.com booking page. |
| `packages/ui` | Shared shadcn-style component library, hooks, utils, global CSS. |
| `packages/kv` | Upstash Redis client + rate limiter. |
| `packages/analytics` | OpenPanel analytics wrapper (used by `apps/web`). |
| `packages/logger` | Pino logger wrapper. |
| `tooling/typescript` | Shared tsconfigs. |

## Getting started

Prerequisites: [Bun](https://bun.sh) ≥ 1.1, Node ≥ 20.9.

```bash
bun install

bun dev:app     # dashboard  → http://localhost:3000
bun dev:convex  # convex dev backend (run alongside dev:app)
bun dev:web     # website    → http://localhost:3001
```

Environment variables for `apps/app` live in `apps/app/.env.local` — see `apps/app/src/env.mjs` for the full schema.

## Useful commands

```bash
bun test        # run tests
bun typecheck   # typecheck all workspaces
bun lint        # biome + sherif
bun format      # biome format
bun run build   # build all apps
```

## Notes

- **Sentry**: client/server/edge SDKs are initialized via `apps/app/src/instrumentation.ts` and `apps/app/src/instrumentation-client.ts` (set `NEXT_PUBLIC_SENTRY_DSN`). Source-map upload (`withSentryConfig`) is intentionally disabled in `apps/app/next.config.ts` — re-enable it there and provide `SENTRY_AUTH_TOKEN` if you want readable production stack traces.
- `prds/` and `references/` are gitignored local docs / vendored reference material.
