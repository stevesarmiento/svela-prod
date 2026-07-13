# 002 — Fix conflicting duplicate transitions on the shared Button

- **Status**: DONE
- **Commit**: 5160057
- **Severity**: HIGH
- **Category**: Cohesion & tokens / Performance
- **Estimated scope**: 1 file, 2 class-string edits

## Problem

The base class of the most-reused interactive component in the product declares `transition-all` **twice with conflicting durations** — 150ms and 75ms. The later class wins in CSS, so every button visibly runs at 75ms while the authored intent reads 150ms. Worse, `transition-all` animates `backdrop-blur`, `outline`, `box-shadow`, and background off the GPU on every hover/press:

```tsx
/* packages/ui/src/components/button.tsx:7 — current */
"inline-flex cursor-pointer backdrop-blur-sm items-center justify-center font-semibold outline outline-2 outline-offset-4 outline-transparent transition-all duration-150 ease-in-out active:scale-[0.98] disabled:opacity-80 disabled:cursor-not-allowed transition-all duration-75 ease-in-out rounded-full"
```

```tsx
/* packages/ui/src/components/button.tsx:20 — current (link variant) */
link: "text-primary/50 hover:text-primary underline-none transition-all duration-150 ease-in-out",
```

`ease-in-out` is also the wrong curve for press/hover feedback (slow start delays the response the user is watching).

## Target

One explicit transition declaration, tokenized, animating only the properties that actually change:

```tsx
/* packages/ui/src/components/button.tsx:7 — target */
"inline-flex cursor-pointer backdrop-blur-sm items-center justify-center font-semibold outline outline-2 outline-offset-4 outline-transparent transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--duration-micro)] ease-[var(--ease-out-cubic)] active:scale-[0.98] disabled:opacity-80 disabled:cursor-not-allowed rounded-full"
```

```tsx
/* packages/ui/src/components/button.tsx:20 — target */
link: "text-primary/50 hover:text-primary underline-none",
```

(The link variant inherits the base transition; its only change is color, which the base list covers.)

`--duration-micro` is 120ms — inside the 100–160ms budget for button press feedback.

## Repo conventions to follow

- Motion tokens live in `packages/ui/src/globals.shared.css:46-67`: `--duration-micro: 120ms`, `--ease-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1)`.
- Exemplar of token usage in a className: `apps/app/src/app/[locale]/(dashboard)/watchlist/_components/watchlist-group-editor-panel.tsx:149` — `duration-[var(--duration-micro)] ease-[var(--ease-out-cubic)]`.

## Steps

1. In `packages/ui/src/components/button.tsx:7`, replace the base cva string with the target string above (only the transition-related classes change; every other class stays byte-identical).
2. In `packages/ui/src/components/button.tsx:20`, remove `transition-all duration-150 ease-in-out` from the `link` variant.

## Boundaries

- Do NOT touch any variant colors, sizes, `rounded-full`, `outline`, or `disabled:` classes.
- Do NOT edit any other component, even ones with the same `transition-all` smell — plan 004 owns the sweep.
- Do NOT add new dependencies.
- If a step doesn't match the code you find (drift since commit 5160057), STOP and report instead of improvising.

## Verification

- **Mechanical**: `bun typecheck` and `bun lint` pass. `grep -c 'transition-all' packages/ui/src/components/button.tsx` returns 0.
- **Feel check**: run `bun dev:app`:
  - Click and hold any primary button: it scales to 0.98 quickly (≈120ms) and releases crisply; hover color changes still animate.
  - In DevTools → Animations at 10% speed, pressing a button should show only transform/color/box-shadow transitions — no `backdrop-filter` or `outline` entries.
- **Done when**: mechanical checks pass and press feedback feels immediate, not laggy, at normal speed.
