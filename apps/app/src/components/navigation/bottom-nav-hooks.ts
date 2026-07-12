import { useEffect, useCallback, useState, useRef, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { COMMAND_ITEMS, type NavigationItem, type ActionItem } from './bottom-nav-constants';
import { SEQUENTIAL_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { useLatest } from '@/hooks/use-latest';

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
 */
export function useSequentialShortcuts() {
  const [activeSequence, setActiveSequence] = useState<string | null>(null);
  const router = useRouter();
  const sequenceRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routerRef = useLatest(router);

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
      timeoutRef.current = setTimeout(() => resetSequenceRef.current(), SEQUENCE_TIMEOUT_MS);
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
        SEQUENTIAL_SHORTCUTS[currentSequence as keyof typeof SEQUENTIAL_SHORTCUTS];
      if (continuations && key in continuations) {
        event.preventDefault();
        const route = continuations[key as keyof typeof continuations];
        resetSequenceRef.current();
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

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      resetSequenceRef.current();
    };
  }, [resetSequenceRef, routerRef]);

  return { activeSequence, resetSequence };
}

/**
 * Global shortcuts: ⌘/Ctrl+K toggles the command palette; Escape exits
 * selection mode. The palette shortcut works even while typing in a field.
 */
export function useKeyboardShortcuts(
  mode: 'navigation' | 'selection',
  setNavigationMode: () => void,
  setIsOpen: Dispatch<SetStateAction<boolean>>
) {
  const modeRef = useLatest(mode);
  const setIsOpenRef = useLatest(setIsOpen);
  const setNavigationModeRef = useLatest(setNavigationMode);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isPaletteShortcut = (event.metaKey || event.ctrlKey) && key === 'k';
      const isSelectionEscape = key === 'escape' && modeRef.current === 'selection';

      if (!isPaletteShortcut && !isSelectionEscape) return;

      event.preventDefault();
      if (isPaletteShortcut) {
        setIsOpenRef.current((prev) => !prev);
      } else {
        setNavigationModeRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modeRef, setIsOpenRef, setNavigationModeRef]);
}

const ALL_COMMAND_ITEMS = (
  COMMAND_ITEMS as ReadonlyArray<{
    group: string;
    items: ReadonlyArray<NavigationItem | ActionItem>;
  }>
).flatMap((group) => group.items);

export function useCommandHandler() {
  const router = useRouter();

  return useCallback((value: string, setIsOpen: (open: boolean) => void) => {
    setIsOpen(false);

    const selectedItem = ALL_COMMAND_ITEMS.find(
      (item) => item.title.toLowerCase() === value.toLowerCase(),
    );

    if (!selectedItem) return;

    if ('href' in selectedItem) {
      router.push(selectedItem.href);
    } else if ('action' in selectedItem) {
      switch (selectedItem.action) {
        case 'bitcoin-price':
          router.push('/overview?q=What is the current price of Bitcoin?');
          break;
        case 'ethereum-price':
          router.push('/overview?q=What is the current price of Ethereum?');
          break;
        case 'market-overview':
          router.push('/overview?q=Show me the top 10 cryptocurrencies');
          break;
      }
    }
  }, [router]);
}

export function usePathHelper() {
  return useCallback((path: string) => {
    return path.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  }, []);
}
