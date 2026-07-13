# 003 — Scale Radix popups from their trigger, not center (+ fix popover slide directions)

- **Status**: DONE
- **Commit**: 5160057
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 6 files, 9 class-string edits

## Problem

Every trigger-anchored Radix surface in `packages/ui` zooms in/out with `zoom-in-95`/`zoom-out-95` but never sets `transform-origin`, so all of them scale from their **center** instead of growing out of the trigger that opened them. A repo-wide grep confirms `--radix-*-content-transform-origin` is used nowhere in `apps/app/src`, `apps/web/src`, or `packages/ui/src`. Radix exposes this variable on each content element for exactly this purpose. (Centered modals are exempt and are NOT part of this plan.)

Affected (each contains `data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95` in its content className):

- `packages/ui/src/components/popover.tsx:21` (`PopoverContent`) and `:39` (`PopoverContentWithoutPortal`)
- `packages/ui/src/components/tooltip.tsx:22`
- `packages/ui/src/components/select.tsx:88`
- `packages/ui/src/components/dropdown-menu.tsx:53` (`DropdownMenuContent`) and `:72` (`DropdownMenuSubContent`)
- `packages/ui/src/components/hover-card.tsx:21`
- `packages/ui/src/components/context-menu.tsx:48` (`ContextMenuContent`) and `:64` (`ContextMenuSubContent`)

Additionally, `popover.tsx` has wrong slide directions. The portal variant slides in **from the bottom for all four sides**:

```
/* popover.tsx:21 — current (excerpt) */
data-[side=bottom]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-bottom-2 data-[side=right]:slide-in-from-bottom-2 data-[side=top]:slide-in-from-bottom-2
```

and the non-portal variant slides **away from** the trigger (e.g. content below the trigger slides up from below, instead of emerging downward from the trigger):

```
/* popover.tsx:39 — current (excerpt) */
data-[side=bottom]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-left-2 data-[side=right]:slide-in-from-right-2 data-[side=top]:slide-in-from-top-2
```

Every other component already uses the correct (trigger-relative) pattern — see `dropdown-menu.tsx:53`:

```
data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2
```

## Target

Each content element gains a Tailwind arbitrary-value origin class naming **its own** Radix variable, appended to the existing base class string:

| File / element | Class to add |
| --- | --- |
| `popover.tsx` (both variants) | `origin-[var(--radix-popover-content-transform-origin)]` |
| `tooltip.tsx` | `origin-[var(--radix-tooltip-content-transform-origin)]` |
| `select.tsx` | `origin-[var(--radix-select-content-transform-origin)]` |
| `dropdown-menu.tsx` (Content and SubContent) | `origin-[var(--radix-dropdown-menu-content-transform-origin)]` |
| `hover-card.tsx` | `origin-[var(--radix-hover-card-content-transform-origin)]` |
| `context-menu.tsx` (Content and SubContent) | `origin-[var(--radix-context-menu-content-transform-origin)]` |

And both popover variants' four `slide-*` classes are replaced with the dropdown-menu pattern quoted above (for both `slide-in-from-*` on open and — where present — matching `slide-out-to-*` on close; the popover variants currently declare only slide-in classes).

## Repo conventions to follow

- Class strings live inline in each component's `cn(...)` call; append the origin class at the end of the base string (before the `className` spread), matching how these files are already formatted.
- Do not invent CSS files or `@layer` rules — this codebase keeps component motion in Tailwind classes.

## Steps

1. `popover.tsx:21` — in `PopoverContent`'s base string: replace the four `data-[side=*]:slide-in-from-bottom-2` classes with `data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2`, and append `origin-[var(--radix-popover-content-transform-origin)]`.
2. `popover.tsx:39` — in `PopoverContentWithoutPortal`'s base string: same slide-class replacement (its current classes are `bottom→bottom, left→left, right→right, top→top`; the corrected set is identical to step 1's), and append the same origin class.
3. `tooltip.tsx:22` — append `origin-[var(--radix-tooltip-content-transform-origin)]`.
4. `select.tsx:88` — append `origin-[var(--radix-select-content-transform-origin)]`.
5. `dropdown-menu.tsx:53` and `:72` — append `origin-[var(--radix-dropdown-menu-content-transform-origin)]` to both.
6. `hover-card.tsx:21` — append `origin-[var(--radix-hover-card-content-transform-origin)]`.
7. `context-menu.tsx:48` and `:64` — append `origin-[var(--radix-context-menu-content-transform-origin)]` to both.

## Boundaries

- Do NOT touch `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, or `drawer.tsx` — centered/edge-attached surfaces are exempt.
- Do NOT change durations, easings, zoom values, or any non-slide/non-origin class.
- Note: the ⌘K palette (`command-popover.tsx`) builds on `PopoverContentWithoutPortal`; plan 001 disables its animation entirely with `animate-none`, so these base-class changes must not re-enable motion there. If plan 001 has landed, verify the palette still opens with zero animation after this change.
- Do NOT add new dependencies.
- If a step doesn't match the code you find (drift since commit 5160057), STOP and report instead of improvising.

## Verification

- **Mechanical**: `bun typecheck` and `bun lint` pass. `grep -rc 'radix-.*-content-transform-origin' packages/ui/src/components/` shows hits in all 6 files.
- **Feel check**: run `bun dev:app`, open DevTools → Animations, set playback to 10%:
  - Open a dropdown menu: content must grow **out of the trigger edge** (e.g. from its top edge when opening downward), not inflate from its own center.
  - Open a tooltip and a popover anchored to each side (or flip one by scrolling to a screen edge): the scale origin and the 0.5rem slide must both come **from the trigger side**.
  - Spam-open/close: no visual jumping of the origin.
- **Done when**: all six surfaces visibly emanate from their trigger in slow motion, and popovers no longer slide from the bottom when anchored left/right/top.
