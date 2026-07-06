# @v1/app — Svela dashboard

The main Svela application: crypto market intelligence (overview, screener, charts, watchlists, portfolio, settings) with Clerk auth and a Convex backend in `./convex`.

## Develop

From the repo root:

```bash
bun dev:app     # Next.js dev server → http://localhost:3000
bun dev:convex  # Convex dev backend (run in a second terminal)
```

Environment variables go in `.env.local`; the schema is defined in `src/env.mjs`.

## Scripts

```bash
bun test                 # bun tests (tests/)
bun run typecheck        # tsc --noEmit
bun run populate-coins   # populate CoinGecko coin list (src/scripts/)
bun run report:assets    # report build asset sizes
```

Note: `postinstall` patches the `liveline` package via `scripts/patch-liveline.mjs`.
