import React from "react";
import { Button } from "@v1/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { IconCommand } from "symbols-react";
import { SearchIcon } from "./search-icon";

interface CommandSearchTriggerProps {
  onOpen: () => void;
  onIntent?: () => void;
}

export function CommandSearchTrigger(props: CommandSearchTriggerProps) {
  return (
    <div className="group relative rounded-[20px] bg-zinc-800 backdrop-blur-md border border-transparent overflow-hidden px-2 py-0 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
      <div className="relative z-10 flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-transparent p-0"
          onPointerEnter={props.onIntent}
          onFocus={props.onIntent}
          onTouchStart={props.onIntent}
          onClick={props.onOpen}
          aria-label="Search and quick actions"
        >
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <SearchIcon className="h-4 w-4 fill-white/40 group-hover:fill-white" />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={25}
              className="dark flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border border-zinc-800 bg-zinc-900/95 shadow-sm"
            >
              <span className="text-xs text-zinc-400">Quick Actions</span>
              <kbd className="flex items-center gap-1 rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-berkeley-mono text-zinc-200 uppercase">
                <IconCommand className="h-2.5 w-2.5 fill-zinc-200" />
                <span>+ K</span>
              </kbd>
            </TooltipContent>
          </Tooltip>
        </Button>
      </div>
    </div>
  );
}
