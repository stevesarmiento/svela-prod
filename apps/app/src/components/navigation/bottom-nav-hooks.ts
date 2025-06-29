import { useEffect, useCallback, useState, Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { COMMAND_ITEMS } from './bottom-nav-constants';
import { SEQUENTIAL_SHORTCUTS } from '@/lib/keyboard-shortcuts';

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

export function useKeyboardShortcuts(
  mode: 'navigation' | 'selection',
  setNavigationMode: () => void,
  setIsOpen: Dispatch<SetStateAction<boolean>>
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(prev => !prev);
      }
      
      if (event.key === 'Escape' && mode === 'selection') {
        setNavigationMode();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mode, setNavigationMode, setIsOpen]);
}

export function useCommandHandler() {
  const router = useRouter();

  return useCallback((value: string, setIsOpen: (open: boolean) => void) => {
    setIsOpen(false);
    
    const allItems = COMMAND_ITEMS.flatMap(group => [...group.items]);
    const selectedItem = allItems.find(item => item.title.toLowerCase() === value.toLowerCase());
    
    if (!selectedItem) {
      return;
    }
    
    setTimeout(() => {
      if ('href' in selectedItem) {
        router.push(selectedItem.href);
      } else if ('action' in selectedItem) {
        const action = selectedItem.action;
        
        switch (action) {
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
    }, 100);
  }, [router]);
}

export function usePathHelper() {
  return useCallback((path: string) => {
    return path.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  }, []);
}