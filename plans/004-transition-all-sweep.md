# 004 — Replace every `transition-all` with explicit, tokenized property lists

- **Status**: DONE
- **Commit**: 5160057
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 16 files, ~22 single-line class edits

## Problem

`transition-all` animates unintended properties (ring/box-shadow, backdrop-filter, background, border, width) off the GPU. On a data-heavy charting dashboard this costs real frames — worst of all on the chart crosshair tooltip, which is repositioned via `style.left`/`style.top` on **every mouse move** while `transition: all 100ms` is active, meaning `left`/`top` (layout properties) are continuously animated on the hottest interaction path in the app:

```ts
/* apps/app/src/hooks/use-chart-instance/tooltip/tooltip-manager.ts:18-19 — current */
tooltipEl.className =
    'fixed hidden overflow-hidden text-[11px] text-white rounded-xl w-[200px] shadow-2xl pointer-events-none z-50 backdrop-blur-xl bg-zinc-900/95 border border-zinc-700/50 transition-all duration-100 ease-in-out';
```

(`show()`/`hide()` toggle `display`, which never animates — the transition serves no purpose except to lag the tooltip behind the crosshair.)

Every other site animates ring/shadow/bg/etc. via `all` when only one or two properties actually change.

## Target

Each site transitions **only the properties that change**, using motion tokens. Tokens (defined in `packages/ui/src/globals.shared.css:46-52`): `--duration-micro: 120ms`, `--duration-ui: 200ms`, `--ease-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1)`.

Exact replacements — in each row, change ONLY the quoted fragment, leaving every other class untouched:

| # | File:line | Replace | With |
| --- | --- | --- | --- |
| 1 | `apps/app/src/hooks/use-chart-instance/tooltip/tooltip-manager.ts:19` | `transition-all duration-100 ease-in-out` | *(delete — no replacement)* |
| 2 | `apps/app/src/app/[locale]/(dashboard)/charts/_components/chart-table.tsx:453` | `transition-all duration-100` | `transition-shadow duration-[var(--duration-micro)]` |
| 3 | `apps/app/src/app/[locale]/(dashboard)/watchlist/_components/watchlist-table.tsx:337` | `transition-all duration-100` | `transition-shadow duration-[var(--duration-micro)]` |
| 4 | `apps/app/src/app/[locale]/(dashboard)/charts/_components/multi-line-lightweight.tsx:445` | `transition-all duration-200` | `transition-[transform,fill] duration-[var(--duration-ui)]` |
| 5 | `apps/app/src/app/[locale]/(dashboard)/charts/_components/multi-line-lightweight.tsx:509` | `transition-all duration-200` | `transition-[transform,fill] duration-[var(--duration-ui)]` |
| 6 | `apps/app/src/app/[locale]/(dashboard)/charts/_components/multi-line-lightweight.tsx:558` | `transition-all duration-200` | `transition-[opacity,background-color] duration-[var(--duration-ui)]` |
| 7 | `apps/app/src/app/[locale]/(dashboard)/charts/[id]/price-chart.tsx:248` | `transition-all duration-100` … `ease-in-out` (both fragments) | `transition-colors duration-[var(--duration-micro)]` (drop `ease-in-out`) |
| 8 | `apps/app/src/app/[locale]/(dashboard)/watchlist/_components/watchlist-card.tsx:196` | `transition-all duration-150 ease-in-out` | `transition-[box-shadow,transform] duration-[var(--duration-micro)] ease-[var(--ease-out-cubic)]` |
| 9 | `apps/app/src/app/[locale]/(dashboard)/watchlist/_components/watchlist-grid-empty-state.tsx:333` | `transition-all duration-300` | `transition-transform duration-[var(--duration-ui)]` |
| 10 | same file `:353` | `transition-all duration-300` | `transition-transform duration-[var(--duration-ui)]` |
| 11 | same file `:373` | `transition-all duration-300` | `transition-transform duration-[var(--duration-ui)]` |
| 12 | `apps/app/src/app/[locale]/(dashboard)/watchlist/_components/coin-search.tsx:259` | `transition-colors` … `transition-all duration-200` (both fragments) | `transition-[color,background-color,transform] duration-[var(--duration-micro)]` (single declaration) |
| 13 | `apps/app/src/app/[locale]/(dashboard)/watchlist/_components/watchlists-grid.tsx:297` | `transition-all duration-150` | `transition-[width] duration-[var(--duration-micro)]` |
| 14 | `apps/app/src/components/navigation/top-nav.tsx:130` | `transition-all ease-in-out duration-150` | `transition-shadow duration-[var(--duration-micro)]` |
| 15 | `apps/app/src/components/navigation/top-nav-profile-client.tsx:40` | `transition-all ease-in-out duration-150` | `transition-shadow duration-[var(--duration-micro)]` |
| 16 | `apps/app/src/components/navigation/back-button.tsx:22` | `transition-all duration-200` | `transition-colors duration-[var(--duration-ui)]` |
| 17 | `packages/ui/src/components/tabs.tsx:31` | `transition-all` | `transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--duration-micro)]` |
| 18 | `packages/ui/src/components/progress.tsx:20` | `transition-all` | `transition-transform duration-[var(--duration-ui)] ease-[var(--ease-out-cubic)]` |
| 19 | `packages/ui/src/components/input-otp.tsx:36` | `transition-all` | `transition-[color,border-color,box-shadow] duration-[var(--duration-micro)]` |
| 20 | `packages/ui/src/components/input.tsx:13` | `transition-colors` … `duration-75 ease-in-out transition-all` (both fragments) | `transition-[color,background-color,box-shadow] duration-[var(--duration-micro)]` (single declaration) |
| 21 | `packages/ui/src/components/toast.tsx:25` | `transition-all` | `transition-transform` |
| 22 | `packages/ui/src/components/accordion.tsx:35` | `transition-all` | *(delete)* and add `[&>svg]:transition-transform [&>svg]:duration-[var(--duration-ui)]` |
| 23 | `packages/ui/src/components/sidebar.tsx:304` | `transition-all ease-linear` | *(delete — no replacement)* |
| 24 | `packages/ui/src/components/svela-logo.tsx:28` | `transition-all duration-300` | `transition-colors duration-[var(--duration-ui)]` |

Rationale notes for non-obvious rows:
- Row 1: tooltip follow must be instant; `display` toggling never animated anyway.
- Row 21: toast swipe (`data-[swipe=move]:translate-x-…` / `data-[swipe=cancel]:translate-x-0`) is the only property this transition needs; entry/exit stays keyframe-driven (out of scope here).
- Row 22: the current `transition-all` sits on the trigger but the rotation is applied to the child `>svg` — the transition must live on the svg for the chevron to animate at all.
- Row 13: this animates `width` on a 6px indicator pip — acceptable at this size; a transform rewrite would require markup changes, which are out of scope.

## Repo conventions to follow

- Token usage exemplar: `apps/app/src/app/[locale]/(dashboard)/watchlist/_components/watchlist-group-editor-panel.tsx:149` — `duration-[var(--duration-micro)] ease-[var(--ease-out-cubic)]`.
- When a row says "single declaration", remove BOTH quoted fragments and insert the replacement once, where the first fragment was.

## Boundaries

- Do NOT touch `packages/ui/src/components/button.tsx` (plan 002), `command-popover.tsx:186` (plan 001), or `accordion.tsx:60` (plan 005 rewrites it).
- Do NOT change which states trigger changes (`hover:`, `aria-selected:`, `data-[state=*]:` classes stay identical) — only the `transition-*`/`duration-*`/`ease-*` fragments listed.
- Do NOT edit `apps/web` — marketing site is out of scope for this plan.
- Do NOT add new dependencies.
- If any row's "Replace" fragment is not found verbatim at that file:line (drift since commit 5160057), SKIP that row and report it — do not improvise.

## Verification

- **Mechanical**: `bun typecheck` and `bun lint` pass. `grep -rn 'transition-all' apps/app/src packages/ui/src --include='*.tsx' --include='*.ts'` returns only `button.tsx`, `command-popover.tsx`, and `accordion.tsx:60` (owned by plans 002/001/005 — or nothing, if those have landed).
- **Feel check**: run `bun dev:app`:
  - Move the crosshair over a price chart: the tooltip must track the cursor with zero lag or rubber-banding.
  - Hover a chart-table card: the ring fades in as before (shadow transition preserved).
  - Switch tabs, focus an input, hover the avatar: all state changes still animate — nothing should feel newly "dead" except the chart tooltip's follow.
  - DevTools → Performance: record 5s of crosshair scrubbing; there should be no continuous `left`/`top` transition activity.
- **Done when**: the grep is clean and the chart tooltip tracks instantly.
