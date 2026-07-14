import type React from "react";
import { Button } from "@v1/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { SearchIcon } from "./search-icon";

interface CommandSearchTriggerProps {
  onOpen: () => void;
  onIntent?: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

export function CommandSearchTrigger(props: CommandSearchTriggerProps) {
  return (
    <div className="group relative">
      <div className="relative z-10 flex items-center">
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <Button
              ref={props.buttonRef}
              variant="ghost"
              size="icon"
              className="relative hover:bg-transparent p-0 after:absolute after:-inset-1 after:content-['']"
              onPointerEnter={props.onIntent}
              onFocus={props.onIntent}
              onTouchStart={props.onIntent}
              onClick={props.onOpen}
              aria-label="Search and quick actions"
            >
              <SearchIcon className="size-6 text-white/50 group-hover:text-white/50" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={15}
            className="dark flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border border-zinc-800 bg-zinc-900/95 shadow-sm"
          >
            <span className="text-xs text-zinc-400">Search</span>
            <kbd className="flex items-center justify-center gap-1 rounded-md bg-zinc-700 w-5 h-5 p-2 text-xs font-diatype-bold  text-zinc-200 uppercase">
              <span>/</span>
            </kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
