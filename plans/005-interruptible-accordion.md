# 005 — Make accordion expand/collapse interruptible (transitions, not keyframes)

- **Status**: DONE
- **Commit**: 5160057
- **Severity**: MEDIUM
- **Category**: Interruptibility (+ Performance)
- **Estimated scope**: 2 files (1 component rewrite, 1 CSS token cleanup)

## Problem

The accordion animates open/close with `@keyframes` that animate `height` (a layout property, off-GPU every frame). Keyframes restart from zero: click the header twice quickly and the content snaps to fully-closed/fully-open before re-animating, instead of reversing from where it is. Expand/collapse is exactly the rapidly-toggled, reversible UI that must use transitions.

```tsx
/* packages/ui/src/components/accordion.tsx:53-66 — current */
const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className={cn(
      "overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
      className,
    )}
    {...props}
  >
    <div className="pb-4 pt-0">{children}</div>
  </AccordionPrimitive.Content>
));
```

```css
/* packages/ui/src/globals.shared.css:71-72 and :82-98 — current */
--animate-accordion-down: accordion-down var(--duration-ui) var(--ease-out-cubic);
--animate-accordion-up: accordion-up var(--duration-ui) var(--ease-out-cubic);
...
@keyframes accordion-down { from { height: 0; } to { height: var(--radix-accordion-content-height); } }
@keyframes accordion-up   { from { height: var(--radix-accordion-content-height); } to { height: 0; } }
```

(`grep -rn 'animate-accordion'` confirms only `accordion.tsx` and `globals.shared.css` reference these.)

## Target

A CSS **grid-template-rows transition** (`0fr ↔ 1fr`), which retargets mid-animation from the current interpolated value. Radix's exit-keyframe detection is not needed because the content stays mounted (`forceMount`) and is hidden via `visibility` + collapsed rows.

```tsx
/* packages/ui/src/components/accordion.tsx — target AccordionContent */
const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    forceMount
    ref={ref}
    className={cn(
      "grid text-sm grid-rows-[0fr] data-[state=open]:grid-rows-[1fr] data-[state=closed]:invisible transition-[grid-template-rows,visibility] duration-[var(--duration-ui)] ease-[var(--ease-out-cubic)] [&[hidden]]:grid",
      className,
    )}
    {...props}
  >
    <div className="min-h-0 overflow-hidden">
      <div className="pb-4 pt-0">{children}</div>
    </div>
  </AccordionPrimitive.Content>
));
```

Why each non-obvious piece exists — do not omit any:
- `forceMount` keeps content in the DOM so the closing transition can play (Radix only waits for *animations*, not transitions, before unmounting).
- `[&[hidden]]:grid` — with `forceMount`, Radix sets the `hidden` attribute when closed; without this override the browser applies `display: none` and no transition ever runs. It must restore `grid` (not `block`) so `grid-template-rows` keeps applying while `hidden` is set during the close transition.
- `data-[state=closed]:invisible` removes closed content from the accessibility tree and tab order (`visibility: hidden`). Listing `visibility` in the transition makes it flip only at the **end** of the closing transition and immediately on open — the standard show/hide pattern.
- The new inner `div` with `min-h-0 overflow-hidden` is required for the `0fr` row to actually collapse (grid items default to `min-height: auto`).

## Repo conventions to follow

- Tokens: `--duration-ui: 200ms`, `--ease-out-cubic` from `packages/ui/src/globals.shared.css:47,52` — same values the old keyframe tokens used, so the feel is unchanged except for interruptibility.
- Reduced motion: the global block in `globals.shared.css:186-219` zeroes `--duration-ui`, which makes this transition instant automatically — no extra handling needed.

## Steps

1. Rewrite `AccordionContent` in `packages/ui/src/components/accordion.tsx` exactly as shown in Target (add `forceMount`, replace the className string, wrap children in the `min-h-0 overflow-hidden` div, keeping the existing `pb-4 pt-0` div inside it).
2. In `packages/ui/src/globals.shared.css`, delete the two now-unused tokens at lines 71-72 (`--animate-accordion-down`, `--animate-accordion-up`) and the `accordion-down`/`accordion-up` `@keyframes` blocks (lines 82-98).
3. In the same file's reduced-motion block (lines ~196-197), delete the two lines `--animate-accordion-down: none;` and `--animate-accordion-up: none;`.

## Boundaries

- Do NOT touch `AccordionTrigger` or `AccordionItem` (the trigger's chevron transition is plan 004, row 22).
- Do NOT change padding, font-size, or any consumer of `<AccordionContent>`.
- Do NOT add new dependencies.
- If the code at these locations doesn't match (drift since commit 5160057), STOP and report instead of improvising.

## Verification

- **Mechanical**: `bun typecheck` and `bun lint` pass. `grep -rn 'accordion-down\|accordion-up' packages/ui` returns nothing.
- **Feel check**: run `bun dev:app` (or any page using the accordion; if none is reachable, render one in isolation):
  - Open and close normally: same ~200ms ease-out feel as before.
  - **Spam the header mid-animation**: the panel must smoothly reverse from its current height — never snap to fully open/closed first. Watch at 10% speed in DevTools → Animations to confirm retargeting.
  - Keyboard check: with the panel closed, Tab must NOT land on links/buttons inside the hidden content; screen-reader/a11y tree (DevTools → Accessibility) must not expose closed content.
  - Toggle `prefers-reduced-motion` (DevTools → Rendering): open/close becomes instant but still works.
- **Done when**: spam-toggling never snaps, closed content is untabbable, and the keyframes are gone.
