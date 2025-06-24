"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { 
  IconDistributeHorizontalCenterFill,  
  IconGear,
  IconMagnifyingglass,
  IconChartLineUptrendXyaxis,
  IconStarFill,
  IconCircleSlash,
  IconCaptionsBubbleFill,
  IconBookmarkFill,
} from "symbols-react";
import {
  CommandPopover,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@v1/ui/command-popover";
import { Button } from "@v1/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";

const menuItems = [
  {
    title: "Overview",
    href: "/overview",
    icon: IconCaptionsBubbleFill,
  },
  {
    title: "Watchlist",
    href: "/watchlist",
    icon: IconBookmarkFill,
  },
  {
    title: "Charts",
    href: "/charts", 
    icon: IconDistributeHorizontalCenterFill,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: IconGear,
  },
];

// Define proper types
type NavigationItem = {
  title: string;
  subtitle: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type ActionItem = {
  title: string;
  subtitle: string;
  action: string;
  icon: React.ComponentType<{ className?: string }>;
};

type CommandItem = NavigationItem | ActionItem;

const commandItems: {
  group: string;
  items: CommandItem[];
}[] = [
  {
    group: "Navigation",
    items: [
      {
        title: "Overview",
        subtitle: "View dashboard and chat",
        href: "/overview",
        icon: IconCaptionsBubbleFill,
      },
      {
        title: "Watchlist",
        subtitle: "Your cryptocurrency watchlist",
        href: "/watchlist",
        icon: IconBookmarkFill,
      },
      {
        title: "Charts",
        subtitle: "Price charts and market data",
        href: "/charts",
        icon: IconDistributeHorizontalCenterFill,
      },
      {
        title: "Settings",
        subtitle: "App preferences and configuration",
        href: "/settings",
        icon: IconGear,
      },
    ]
  },
  {
    group: "Quick Actions",
    items: [
      {
        title: "Bitcoin Price",
        subtitle: "Get current BTC price",
        action: "bitcoin-price",
        icon: IconChartLineUptrendXyaxis,
      },
      {
        title: "Ethereum Price", 
        subtitle: "Get current ETH price",
        action: "ethereum-price",
        icon: IconChartLineUptrendXyaxis,
      },
      {
        title: "Market Overview",
        subtitle: "Top 10 cryptocurrencies",
        action: "market-overview", 
        icon: IconStarFill,
      },
    ]
  }
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  // Helper function to clean pathname (same as top-nav)
  const getCleanPath = (path: string) => {
    return path.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  };

  // Keyboard shortcut to open command palette
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCommandSelect = (value: string) => {
    console.log('Command selected:', value);
    setIsOpen(false);
    
    const allItems = commandItems.flatMap(group => group.items);
    const selectedItem = allItems.find(item => item.title.toLowerCase() === value.toLowerCase());
    
    console.log('Found item:', selectedItem);
    
    if (!selectedItem || typeof selectedItem !== 'object') {
      console.log('No item found for:', value);
      return;
    }
    
    // Add a small delay to ensure popover closes before navigation
    setTimeout(() => {
      if ('href' in selectedItem) {
        console.log('Navigating to:', (selectedItem as NavigationItem).href);
        router.push((selectedItem as NavigationItem).href);
      } else if ('action' in selectedItem) {
        const action = (selectedItem as ActionItem).action;
        console.log('Executing action:', action);
        
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
          default:
            console.log('Unknown action:', action);
        }
      }
    }, 100);
  };

  return (
    <>
      <div className={`fixed z-50 transition-all duration-200 ${
        isOpen 
          ? 'bottom-8 left-[45%] transform -translate-x-1/2' 
          : 'bottom-8 left-[50%] transform -translate-x-1/2'                            
      }`}>
        <div className="flex items-center gap-2">
          {/* Main navigation dock */}
          <div className={`relative rounded-[20px] bg-zinc-900 overflow-hidden p-1
                         shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
                         dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]
                         transition-all duration-200 ${isOpen ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
            
            {/* Background Pattern - FIRST (behind everything) */}
            <div className="absolute inset-0 opacity-5 z-0"
              style={{
                backgroundImage: `
                  radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
                  radial-gradient(circle at 75% 75%, white 1px, transparent 1px)
                `,
                backgroundSize: "24px 24px",
              }}
            />
            
            <div className="relative z-10 flex items-center gap-1 p-1">
              {menuItems.map((item) => {
                const isActive = getCleanPath(pathname) === item.href;
                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className={`group p-3 rounded-xl transition-colors duration-200 hover:bg-transparent ${
                      isActive ? "bg-transparent" : ""
                    }`}
                    title={item.title}
                  >
                    <item.icon className={`size-4 ${
                      isActive ? 'fill-white' : 'fill-white/40 group-hover:fill-white'
                    }`} />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Command Search */}
          <div className="relative rounded-[20px] bg-zinc-900 overflow-hidden px-2 py-0 hover:bg-zinc-800/80 transition-all duration-200 cursor-pointer
                         shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
                         dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
            
            {/* Background Pattern - FIRST (behind everything) */}
            <div className="absolute inset-0 opacity-5 z-0"
              style={{
                backgroundImage: `
                  radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
                  radial-gradient(circle at 75% 75%, white 1px, transparent 1px)
                `,
                backgroundSize: "24px 24px",
              }}
            />
            
            <div className="relative z-10">
              <CommandPopover
                open={isOpen}
                onOpenChange={setIsOpen}
                trigger={
                  <div className="flex items-center">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="hover:bg-transparent p-0" 
                      onClick={() => setIsOpen(true)}
                      aria-label="Search and quick actions"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconMagnifyingglass className="h-4 w-4 fill-white/70 hover:fill-white" />
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={15} className="flex items-center text-xs p-0 border-none bg-none shadow-none">
                          <kbd className="rounded-sm bg-border px-1.5 py-0.5 text-xs font-mono">
                            ⌘ + K
                          </kbd>
                        </TooltipContent>
                      </Tooltip>
                    </Button>
                    <div 
                      className={`overflow-hidden transition-all motion-ease-spring-bouncy motion-duration-200 ${isOpen ? 'w-[420px] opacity-100' : 'w-0 opacity-0'}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <CommandInput 
                        placeholder="Type a command or search..." 
                        className="bg-transparent border-none rounded-2xl h-[53px] px-4 text-white placeholder:text-white/50" 
                      />
                    </div>
                  </div>
                }
              >
                <CommandList className="z-[100] bg-transparent">
                  <CommandEmpty>
                    <div className="flex flex-col items-center justify-center py-6 gap-2">
                      <IconCircleSlash className="h-8 w-8 fill-muted-foreground rotate-90" />
                      <h3 className="font-medium">No Results Found</h3>
                      <p className="text-sm text-muted-foreground">Try searching for something else</p>
                    </div>
                  </CommandEmpty>
                  
                  {commandItems.map((group) => (
                    <CommandGroup key={group.group} heading={group.group}>
                      {group.items.map((item) => (
                        <CommandItem
                          key={item.title}
                          value={item.title}
                          onSelect={handleCommandSelect}
                          className="cursor-pointer bg-transparent"
                        >
                          <div className="flex items-center justify-between w-full bg-transparent hover:bg-transparent p-2 rounded-lg">
                            <div className="flex items-center gap-3 pr-5">
                              <item.icon className="size-5 fill-current" />
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{item.title}</span>
                                <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {'href' in item && (
                                <span className="text-xs px-2 py-1 bg-accent rounded">Page</span>
                              )}
                              {'action' in item && (
                                <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">Action</span>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
                
                {/* Footer with shortcuts */}
                <div className="border-t border-border p-2">
                  <div className="flex items-center justify-between gap-4 px-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <span>navigate</span>
                      <kbd className="rounded border border-border bg-muted px-1.5 font-mono">
                        ↑
                      </kbd>
                      <kbd className="rounded border border-border bg-muted px-1.5 font-mono">
                        ↓
                      </kbd>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>select</span>
                      <kbd className="rounded border border-border bg-muted px-1.5 font-mono">
                        enter
                      </kbd>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>close</span>
                      <kbd className="rounded border border-border bg-muted px-1.5 font-mono">
                        esc
                      </kbd>
                    </div>
                  </div>
                </div>
              </CommandPopover>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}