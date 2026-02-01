import { useEffect, useCallback, useState, Dispatch, SetStateAction, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { COMMAND_ITEMS, type NavigationItem, type ActionItem } from './bottom-nav-constants';
import { SEQUENTIAL_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { useLatest } from '@/hooks/use-latest';
import { Effect, Fiber, Queue, Ref } from "effect";
import { useEffectScoped } from "@/lib/effect/react";

// React 19: Inline type definition for better maintainability

export function useSequentialShortcuts() {
  const [activeSequence, setActiveSequence] = useState<string | null>(null);
  const router = useRouter();
  const immediateSequenceRef = useRef<string | null>(null);

  const resetSequence = useCallback(() => {
    immediateSequenceRef.current = null;
    setActiveSequence(null);
  }, []);

  const activeSequenceRef = useLatest(activeSequence);
  const resetSequenceRef = useLatest(resetSequence);
  const routerRef = useLatest(router);

  useEffectScoped(
    () =>
      Effect.gen(function* () {
        interface SequenceEvent {
          readonly kind: "start" | "next";
          readonly key: string;
        }

        const queue = yield* Queue.bounded<SequenceEvent>(64);
        const timeoutFiberRef = yield* Ref.make<Fiber.RuntimeFiber<void, never> | null>(null);

        const clearTimeoutFiber = Effect.gen(function* () {
          const fiber = yield* Ref.get(timeoutFiberRef);
          if (!fiber) return;
          yield* Fiber.interruptFork(fiber);
          yield* Ref.set(timeoutFiberRef, null);
        });

        const startTimeoutFiber = Effect.gen(function* () {
          yield* clearTimeoutFiber;
          const fiber = yield* Effect.fork(
            Effect.sleep("2 seconds").pipe(
              Effect.tap(() => Effect.sync(() => resetSequenceRef.current())),
              Effect.asVoid,
            ),
          );
          yield* Ref.set(timeoutFiberRef, fiber);
        });

        const processKey = (event: SequenceEvent) =>
          Effect.gen(function* () {
            if (event.kind === "start") {
              yield* startTimeoutFiber;
              return;
            }

            // We're in a sequence, check for completion.
            yield* clearTimeoutFiber;

            const currentSequence = immediateSequenceRef.current ?? activeSequenceRef.current;
            if (!currentSequence) return;

            const shortcuts = SEQUENTIAL_SHORTCUTS[currentSequence as keyof typeof SEQUENTIAL_SHORTCUTS];
            if (shortcuts && event.key in shortcuts) {
              const route = shortcuts[event.key as keyof typeof shortcuts];
              yield* Effect.sync(() => {
                routerRef.current.push(route);
                resetSequenceRef.current();
              });
              return;
            }

            yield* Effect.sync(() => resetSequenceRef.current());
          });

        // Worker fiber that processes key events sequentially.
        yield* Effect.fork(
          Effect.forever(
            Queue.take(queue).pipe(
              Effect.flatMap(processKey),
            ),
          ),
        );

        const handleKeyDown = (event: KeyboardEvent) => {
          // Ignore if typing in an input.
          if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
            return;
          }

          // Ignore if modifier keys are pressed.
          if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
          }

          const key = event.key.toLowerCase();
          const currentSequence = immediateSequenceRef.current;

          if (!currentSequence) {
            // Only handle valid starters.
            if (!(key in SEQUENTIAL_SHORTCUTS)) return;

            event.preventDefault();
            immediateSequenceRef.current = key;
            setActiveSequence(key);
            Queue.unsafeOffer(queue, { kind: "start", key });
            return;
          }

          event.preventDefault();
          Queue.unsafeOffer(queue, { kind: "next", key });
        };

        document.addEventListener("keydown", handleKeyDown);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            document.removeEventListener("keydown", handleKeyDown);
          }).pipe(
            Effect.zipRight(clearTimeoutFiber),
          ),
        );

        // Keep the scope alive until the component unmounts / deps change.
        yield* Effect.never;
      }),
    [],
  );

  return { activeSequence, resetSequence };
}

// React 19: Simplified keyboard shortcut handling with direct callbacks
export function useKeyboardShortcuts(
  mode: 'navigation' | 'selection',
  setNavigationMode: () => void,
  setIsOpen: Dispatch<SetStateAction<boolean>>
) {
  const [isPending, startTransition] = useTransition();

  // React 19: Simplified handler - direct state changes with transition batching
  const handleShortcut = useCallback((key: string, modifiers: string[], currentMode: 'navigation' | 'selection') => {
    startTransition(() => {
      // Handle meta/ctrl key combinations
      if (modifiers.includes('meta') || modifiers.includes('ctrl')) {
        switch (key.toLowerCase()) {
          case 'k':
            setIsOpen(prev => !prev);
            break;
        }
      }
      
      // Handle escape key
      if (key === 'Escape' && currentMode === 'selection') {
        setNavigationMode();
      }
    });
  }, [setIsOpen, setNavigationMode, startTransition]);

  const modeRef = useLatest(mode);
  const handleShortcutRef = useLatest(handleShortcut);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const modifiers: string[] = [];
      if (event.metaKey) modifiers.push('meta');
      if (event.ctrlKey) modifiers.push('ctrl');
      if (event.altKey) modifiers.push('alt');

      // Only handle specific shortcuts to avoid unnecessary processing
      const key = event.key.toLowerCase();
      const currentMode = modeRef.current;
      const isRelevantShortcut = 
        ((modifiers.includes('meta') || modifiers.includes('ctrl')) && key === 'k') ||
        (key === 'escape' && currentMode === 'selection');

      if (isRelevantShortcut) {
        event.preventDefault();
        handleShortcutRef.current(event.key, modifiers, currentMode);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { isPending }; // Return pending state for UI feedback if needed
}

// React 19: Simplified command handler - no setTimeout needed with enhanced batching
export function useCommandHandler() {
  const router = useRouter();

  return useCallback((value: string, setIsOpen: (open: boolean) => void) => {
    setIsOpen(false);
    
    // Find the selected item from all command groups
    const allItems = (COMMAND_ITEMS as { group: string; items: (NavigationItem | ActionItem)[] }[]).flatMap(group => group.items);
    const selectedItem = allItems.find(item => item.title.toLowerCase() === value.toLowerCase());
    
    if (!selectedItem) return;
    
    // React 19: Direct execution - batching handles timing automatically
    if ('href' in selectedItem) {
      router.push(selectedItem.href);
    } else if ('action' in selectedItem) {
      // Handle action items
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