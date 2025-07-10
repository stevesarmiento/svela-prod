import { useEffect, useCallback, useState, Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { COMMAND_ITEMS, type NavigationItem, type ActionItem } from './bottom-nav-constants';
import { SEQUENTIAL_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { useBottomNav } from './bottom-nav-context';

type CommandGroup = {
  group: string;
  items: (NavigationItem | ActionItem)[];
};

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
  const { setIsChatOpen, openChat } = useBottomNav();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Command + K for command search
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(prev => !prev);
        setIsChatOpen(false); // Close chat when opening command search
      }
      
      // Command + J for chat
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        openChat();
      }
      
      // Escape to exit selection mode or close overlays
      if (event.key === 'Escape') {
        if (mode === 'selection') {
          setNavigationMode();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mode, setNavigationMode, setIsOpen, setIsChatOpen, openChat]);
}

export function useCommandHandler() {
  const router = useRouter();

  return useCallback((value: string, setIsOpen: (open: boolean) => void) => {
    setIsOpen(false);
    
    // Find the selected item from all command groups
    const allItems = (COMMAND_ITEMS as CommandGroup[]).flatMap(group => group.items);
    const selectedItem = allItems.find(item => item.title.toLowerCase() === value.toLowerCase());
    
    if (!selectedItem) return;
    
    setTimeout(() => {
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
    }, 100);
  }, [router]);
}

export function usePathHelper() {
  return useCallback((path: string) => {
    return path.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  }, []);
}