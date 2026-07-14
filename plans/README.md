# Animation Improvement Plans

Produced by the `improve-animations` audit at commit `5160057` (2026-07-12). Each plan is self-contained — an executor needs no other context. Run one with `improve-animations execute <plan>` or hand it to any agent.

## Plans

| # | Plan | Severity | Category | Status |
| --- | --- | --- | --- | --- |
| 001 | [Remove ⌘K command palette open/close animation](001-command-palette-no-animation.md) | HIGH | Purpose & frequency | DONE |
| 002 | [Fix Button's conflicting duplicate transitions](002-button-transition-collision.md) | HIGH | Cohesion / Performance | DONE |
| 003 | [Radix popups scale from trigger + popover slide fix](003-radix-transform-origins.md) | HIGH | Physicality & origin | DONE |
| 004 | [Replace every `transition-all` with explicit properties](004-transition-all-sweep.md) | HIGH | Performance | DONE |
| 005 | [Interruptible accordion (transitions, not keyframes)](005-interruptible-accordion.md) | MEDIUM | Interruptibility | DONE |

## Recommended execution order

**001 → 002 → 003 → 004 → 005** (also safe to run 002 anytime; it touches only `button.tsx`).

## Dependencies & interactions

- **001 before 003**: both involve `popover.tsx` behavior. 001 silences the palette via `animate-none` overrides in `command-popover.tsx` without touching `popover.tsx`; 003 then edits `popover.tsx` base classes. 003's verification includes re-checking the palette stays animation-free.
- **004 explicitly excludes** `button.tsx` (002), `command-popover.tsx:186` (001), and `accordion.tsx:60` (005). Its final grep check assumes those plans own their remaining `transition-all` occurrences.
- **005 and 004 both touch `accordion.tsx`** but different elements (005: Content; 004 row 22: Trigger). No ordering constraint, but don't run them concurrently in the same worktree.
- All plans read motion tokens from `packages/ui/src/globals.shared.css` — none modify token values.

## Audit findings not yet planned

The audit surfaced additional vetted findings (toast keyframes, reduced-motion over/under-reach, sidebar linear/width morphs, main-thread spinner & text-shimmer, token-bypass consolidation, screener `ease-in`) plus four missed opportunities (watchlist loading fade, grid layout animation, movers-toggle crossfade, grid↔table transition). Re-run `improve-animations` and select them, or use `improve-animations plan <description>`, to turn any into a plan.
