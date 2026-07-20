/**
 * Guard for single-letter global shortcuts (S = Smart Screener, F = Add
 * filter). Returns true when the keystroke should be treated as TYPING, not a
 * shortcut: any modifier held, focus in an editable element, or an open
 * dialog/popover (its own inputs own the keyboard there).
 */
export function isTypingContext(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  ) {
    return true;
  }

  // Focus inside an open Radix dialog or popover (e.g. the filter editor,
  // the Smart Screener dialog) — let those surfaces handle their own keys.
  return (
    target.closest(
      '[role="dialog"], [data-radix-popper-content-wrapper]',
    ) !== null
  );
}
