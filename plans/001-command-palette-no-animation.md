# 001 — Remove open/close animation from the ⌘K command palette

- **Status**: DONE
- **Commit**: 5160057
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file, 2 class-string edits

## Problem

The command palette is opened with ⌘K / Ctrl+K (bound in `apps/app/src/components/navigation/bottom-nav-hooks.ts:110`) — a keyboard-initiated, 100+ times/day surface. Per the frequency rule, such surfaces get **no animation, ever** (Raycast's palette has none). Ours currently plays a fade + zoom + 6rem vertical slide on every open and close.

The palette content adds its own slide classes:

```tsx
/* packages/ui/src/components/command-popover.tsx:73-77 — current */
<PopoverContentWithoutPortal
  ref={contentRef}
  className="dark relative rounded-[20px] bg-zinc-900 border border-transparent overflow-hidden p-1 w-full sm:w-[499px] max-w-[calc(100vw-2rem)] z-[1000] data-[state=open]:slide-in-from-bottom-24 data-[state=closed]:slide-out-to-bottom-24
             text-popover-foreground shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_30px_oklch(0.2978_0.0083_317.72_/_0.9),0_4px_16px_oklch(0_0_0_/_0.4)]"
```

…and it also **inherits** fade/zoom animation from its base component, `PopoverContentWithoutPortal` in `packages/ui/src/components/popover.tsx:39`, whose base class string contains:

```
data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ...
```

Separately, the palette's result rows animate their selection highlight:

```tsx
/* packages/ui/src/components/command-popover.tsx:184-189 — current (CommandPrimitive.Item) */
className={cn(
  "relative flex cursor-pointer select-none items-center px-2 py-1.5 text-sm outline-none aria-selected:bg-gray-100/80 dark:aria-selected:bg-zinc-800/30 rounded-2xl aria-selected:text-gray-900 dark:aria-selected:text-white active:scale-[0.98] transition-all duration-150 ease-in-out",
  className,
)}
```

Arrow-key navigation moves `aria-selected` on every keystroke; a 150ms `ease-in-out` color transition makes the highlight visibly lag the cursor. It also uses `transition-all` (a performance finding on its own).

## Target

1. Palette opens and closes **instantly** — no fade, no zoom, no slide, in either direction.
2. Selection highlight moves **instantly** with arrow keys. Press feedback (`active:scale-[0.98]`) keeps a fast transform-only transition.

## Repo conventions to follow

- `cn()` (`packages/ui/src/utils/cn.ts`) uses `tailwind-merge`, so classes passed via `className` **override** conflicting base classes with the same variant prefix. `data-[state=open]:animate-none` passed by the palette will beat the base's `data-[state=open]:animate-in`. Rely on this — do NOT edit `popover.tsx` (its base animation is in scope of plan 003, and other popovers legitimately animate).
- Motion tokens: `--duration-micro` (120ms) and `--ease-out-cubic` are defined in `packages/ui/src/globals.shared.css:46-52`. Exemplar usage: `apps/app/src/app/[locale]/(dashboard)/watchlist/_components/watchlist-group-editor-panel.tsx:149` (`duration-[var(--duration-micro)] ease-[var(--ease-out-cubic)]`).

## Steps

1. In `packages/ui/src/components/command-popover.tsx` (~line 75), in the `PopoverContentWithoutPortal` className:
   - Remove: `data-[state=open]:slide-in-from-bottom-24 data-[state=closed]:slide-out-to-bottom-24`
   - Add: `data-[state=open]:animate-none data-[state=closed]:animate-none`
2. In the same file (~line 186), in the `CommandPrimitive.Item` className, replace:
   - `transition-all duration-150 ease-in-out`
   - with: `transition-transform duration-[var(--duration-micro)] ease-[var(--ease-out-cubic)]`
   - (Keep `active:scale-[0.98]` and every `aria-selected:` class exactly as they are — colors now change instantly because only `transform` transitions.)

## Boundaries

- Do NOT edit `packages/ui/src/components/popover.tsx` — other consumers keep their animation; plan 003 owns that file.
- Do NOT change palette markup, focus handling, or the `onOpenAutoFocus` handler (a comment in the file explains cmdk's DOM requirements — leave them intact).
- Do NOT add new dependencies.
- If a step doesn't match the code you find (drift since commit 5160057), STOP and report instead of improvising.

## Verification

- **Mechanical**: `bun typecheck` and `bun lint` pass with no new errors.
- **Feel check**: run `bun dev:app`, then:
  - Press ⌘K repeatedly: the palette must appear/disappear with zero motion — no fade, zoom, or slide in either direction. Spamming ⌘K must never show a partial animation.
  - Arrow through results: the highlight must land on each row with no perceptible lag or fade-in of the background color.
  - In DevTools → Animations panel at 10% speed, opening the palette should register no animation at all.
- **Done when**: both feel checks pass and no `slide-in-from-bottom-24` remains in the file.
