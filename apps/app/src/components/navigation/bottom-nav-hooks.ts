import { useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { COMMAND_ITEMS } from './bottom-nav-constants';

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