import { useLatest } from "@/hooks/use-latest";
import { SEQUENTIAL_SHORTCUTS } from "@/lib/keyboard-shortcuts";
import { usePathname, useRouter } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { COMMAND_ITEMS, type NavigationItem } from "./bottom-nav-constants";

const SEQUENCE_TIMEOUT_MS = 2000;

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * Vim-style sequential shortcuts (e.g. `g` then `h` → /overview).
 *
 * Only keys that are part of a valid sequence are swallowed; any other key
 * pressed mid-sequence resets the sequence and passes through untouched, so
 * unrelated single-key shortcuts keep working within the 2s window.
 *
 * When the sequence targets the route the user is already on (exact match),
 * `onReactivateRoute` fires instead of a redundant navigation — mirroring
 * what re-clicking the active tab does (e.g. `g w` on /watchlists opens the
 * add-to-comparison palette).
 */
export function useSequentialShortcuts(
  onReactivateRoute?: (route: string) => void,
) {
  const [activeSequence, setActiveSequence] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const getCleanPath = usePathHelper();
  const sequenceRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routerRef = useLatest(router);
  const cleanPathRef = useLatest(getCleanPath(pathname));
  const onReactivateRouteRef = useLatest(onReactivateRoute);

  const resetSequence = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    sequenceRef.current = null;
    setActiveSequence(null);
  }, []);

  const resetSequenceRef = useLatest(resetSequence);

  useEffect(() => {
    const startSequence = (key: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      sequenceRef.current = key;
      setActiveSequence(key);
      timeoutRef.current = setTimeout(
        () => resetSequenceRef.current(),
        SEQUENCE_TIMEOUT_MS,
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      const currentSequence = sequenceRef.current;

      if (!currentSequence) {
        if (!(key in SEQUENTIAL_SHORTCUTS)) return;
        event.preventDefault();
        startSequence(key);
        return;
      }

      // A sequence is active — try to complete it.
      const continuations =
        SEQUENTIAL_SHORTCUTS[
          currentSequence as keyof typeof SEQUENTIAL_SHORTCUTS
        ];
      if (continuations && key in continuations) {
        event.preventDefault();
        const route = continuations[key as keyof typeof continuations];
        resetSequenceRef.current();
        // Already on the target route: trigger its secondary action (same as
        // re-clicking the active tab) instead of a no-op navigation.
        if (cleanPathRef.current === route) {
          onReactivateRouteRef.current?.(route);
          return;
        }
        routerRef.current.push(route);
        return;
      }

      // Not a valid continuation: reset. If the key starts a new sequence,
      // restart; otherwise let it pass through to other handlers untouched.
      resetSequenceRef.current();
      if (key in SEQUENTIAL_SHORTCUTS) {
        event.preventDefault();
        startSequence(key);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      resetSequenceRef.current();
    };
  }, [cleanPathRef, onReactivateRouteRef, resetSequenceRef, routerRef]);

  return { activeSequence, resetSequence };
}

/**
 * Global shortcuts: `/` toggles the command palette; Escape exits
 * selection mode. The palette shortcut is ignored while typing in a field
 * so slashes can still be entered in inputs.
 */
export function useKeyboardShortcuts(
  mode: "navigation" | "selection",
  setNavigationMode: () => void,
  setIsOpen: Dispatch<SetStateAction<boolean>>,
) {
  const modeRef = useLatest(mode);
  const setIsOpenRef = useLatest(setIsOpen);
  const setNavigationModeRef = useLatest(setNavigationMode);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isPaletteShortcut =
        key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableTarget(event.target);
      // Escape while a dialog is open (e.g. the analysis dialog launched from
      // the selection dock) should close only the dialog, not also exit
      // selection mode. Radix dismisses in the capture phase and React may
      // flush the close before this bubble listener runs, so checking the DOM
      // for an open dialog is racy — check the event target instead (Radix
      // focus-locks inside the dialog while it's open).
      const targetInDialog =
        event.target instanceof Element &&
        event.target.closest('[role="dialog"]') !== null;
      const hasOpenDialog =
        targetInDialog ||
        document.querySelector('[role="dialog"][data-state="open"]') !== null;
      const isSelectionEscape =
        key === "escape" && modeRef.current === "selection" && !hasOpenDialog;

      if (!isPaletteShortcut && !isSelectionEscape) return;

      event.preventDefault();
      if (isPaletteShortcut) {
        setIsOpenRef.current((prev) => !prev);
      } else {
        setNavigationModeRef.current();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modeRef, setIsOpenRef, setNavigationModeRef]);
}

const ALL_COMMAND_ITEMS = (
  COMMAND_ITEMS as ReadonlyArray<{
    group: string;
    items: ReadonlyArray<NavigationItem>;
  }>
).flatMap((group) => group.items);

export function useCommandHandler() {
  const router = useRouter();

  return useCallback(
    (value: string, setIsOpen: (open: boolean) => void) => {
      setIsOpen(false);

      const selectedItem = ALL_COMMAND_ITEMS.find(
        (item) => item.title.toLowerCase() === value.toLowerCase(),
      );

      if (selectedItem) {
        router.push(selectedItem.href);
      }
    },
    [router],
  );
}

export function usePathHelper() {
  return useCallback((path: string) => {
    return path.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";
  }, []);
}
