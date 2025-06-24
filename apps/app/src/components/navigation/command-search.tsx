import React, { useRef, useEffect } from 'react';
import { Button } from "@v1/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { IconMagnifyingglass, IconCircleSlash, IconCommand } from "symbols-react";
import {
  CommandPopover,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@v1/ui/command-popover";
import { COMMAND_ITEMS } from './bottom-nav-constants';

interface CommandSearchProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onCommandSelect: (value: string, setIsOpen: (open: boolean) => void) => void;
}

export const CommandSearch = React.memo(({ isOpen, setIsOpen, onCommandSelect }: CommandSearchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  
  const handleCommandSelect = React.useCallback((value: string) => {
    onCommandSelect(value, setIsOpen);
  }, [onCommandSelect, setIsOpen]);

  // Focus the input when the command opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  return (
    <div className="relative rounded-[20px] bg-zinc-900 overflow-hidden px-2 py-0 hover:bg-zinc-800/80 transition-all duration-200 cursor-pointer
                   shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
                   dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
      
      {/* Background Pattern */}
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
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <IconMagnifyingglass className="h-4 w-4 fill-white/70 hover:fill-white" />
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={25} className="flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border-zinc=-800/20 border bg-none shadow-none">
                    <span className="text-xs text-zinc-400">Quick Actions</span>
                        <kbd className="flex items-center gap-1 rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-mono text-zinc-300 uppercase">
                            <IconCommand className="h-2.5 w-2.5 fill-zinc-300" />
                            <span>+ K</span>
                        </kbd>
                    </TooltipContent>
                </Tooltip>
              </Button>
              <div 
                className={`overflow-hidden transition-all motion-ease-spring-bouncy motion-duration-200 ${isOpen ? 'w-[420px] opacity-100' : 'w-0 opacity-0'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <CommandInput 
                  ref={inputRef}
                  placeholder="Navigate to..." 
                  className="bg-transparent border-none rounded-2xl h-[53px] pl-2 text-white placeholder:text-white/50" 
                  autoFocus={isOpen}
                />
              </div>
            </div>
          }
        >
          <CommandList className="z-[100] bg-transparent max-h-[300px]">
            <CommandEmpty>
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <IconCircleSlash className="h-8 w-8 fill-muted-foreground rotate-90" />
                <h3 className="font-medium">No Results Found</h3>
                <p className="text-sm text-muted-foreground">Try searching for something else</p>
              </div>
            </CommandEmpty>
            
            {COMMAND_ITEMS.map((group) => (
              <CommandGroup key={group.group} heading={group.group}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.title}
                    value={item.title}
                    onSelect={handleCommandSelect}
                    className="cursor-pointer bg-transparent focus:bg-accent focus:text-accent-foreground"
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
                        {'href' in item && item.shortcut ? (
                          <kbd className="rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-mono text-zinc-300 uppercase">
                            {item.shortcut}
                          </kbd>
                        ) : 'href' in item ? (
                          <span className="text-xs px-2 py-1 bg-accent rounded">Page</span>
                        ) : (
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
                <kbd className="rounded border border-border bg-muted px-1.5 font-mono">↑</kbd>
                <kbd className="rounded border border-border bg-muted px-1.5 font-mono">↓</kbd>
              </div>
              <div className="flex items-center gap-1">
                <span>select</span>
                <kbd className="rounded border border-border bg-muted px-1.5 font-mono">enter</kbd>
              </div>
              <div className="flex items-center gap-1">
                <span>close</span>
                <kbd className="rounded border border-border bg-muted px-1.5 font-mono">esc</kbd>
              </div>
            </div>
          </div>
        </CommandPopover>
      </div>
    </div>
  );
});

CommandSearch.displayName = 'CommandSearch';