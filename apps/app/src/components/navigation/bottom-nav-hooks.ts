import { useEffect, useCallback, useState, Dispatch, SetStateAction, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { COMMAND_ITEMS, type NavigationItem, type ActionItem } from './bottom-nav-constants';
import { SEQUENTIAL_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { useChatContext } from './bottom-nav-context';
import { isAlphaFeaturesEnabled } from '@/lib/feature-flags';

// React 19: Inline type definition for better maintainability

export function useSequentialShortcuts() {
  const [activeSequence, setActiveSequence] = useState<string | null>(null);
  const [sequenceTimeout, setSequenceTimeout] = useState<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const resetSequence = useCallback(() => {
    setActiveSequence(null);
    if (sequenceTimeout) {
      clearTimeout(sequenceTimeout);
      setSequenceTimeout(null);
    }
  }, [sequenceTimeout]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ignore if modifier keys are pressed
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (!activeSequence) {
        // Check if this starts a sequence
        if (key in SEQUENTIAL_SHORTCUTS) {
          event.preventDefault();
          setActiveSequence(key);
          
          // Set timeout to reset sequence
          const timeout = setTimeout(() => {
            resetSequence();
          }, 2000); // 2 second timeout
          
          setSequenceTimeout(timeout);
        }
      } else {
        // We're in a sequence, check for completion
        event.preventDefault();
        
        const shortcuts = SEQUENTIAL_SHORTCUTS[activeSequence as keyof typeof SEQUENTIAL_SHORTCUTS];
        if (shortcuts && key in shortcuts) {
          const route = shortcuts[key as keyof typeof shortcuts];
          router.push(route);
          resetSequence();
        } else {
          // Invalid sequence, reset
          resetSequence();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeout) {
        clearTimeout(sequenceTimeout);
      }
    };
  }, [activeSequence, router, resetSequence, sequenceTimeout]);

  return { activeSequence, resetSequence };
}

// React 19: Simplified keyboard shortcut handling with direct callbacks
export function useKeyboardShortcuts(
  mode: 'navigation' | 'selection',
  setNavigationMode: () => void,
  setIsOpen: Dispatch<SetStateAction<boolean>>
) {
  const { openChat } = useChatContext();
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
          case 'j':
            if (isAlphaFeaturesEnabled()) {
              openChat();
            }
            break;
        }
      }
      
      // Handle escape key
      if (key === 'Escape' && currentMode === 'selection') {
        setNavigationMode();
      }
    });
  }, [setIsOpen, openChat, setNavigationMode, startTransition]);

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
      const isRelevantShortcut = 
        ((modifiers.includes('meta') || modifiers.includes('ctrl')) && (key === 'k' || key === 'j')) ||
        (key === 'escape' && mode === 'selection');

      if (isRelevantShortcut) {
        event.preventDefault();
        handleShortcut(event.key, modifiers, mode);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mode, handleShortcut]);

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