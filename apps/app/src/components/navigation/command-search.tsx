import React from "react";
import { CommandSearchPopoverContent } from "./command-search-popover-content";

import type { CommandContext } from "./bottom-nav-context";

interface CommandSearchProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onCommandSelect: (value: string, setIsOpen: (open: boolean) => void) => void;
  context?: CommandContext;
}

export const CommandSearch = React.memo(function CommandSearch(
  props: CommandSearchProps,
) {
  return (
    <CommandSearchPopoverContent
      isOpen={props.isOpen}
      setIsOpen={props.setIsOpen}
      onCommandSelect={props.onCommandSelect}
      context={props.context}
    />
  );
});

CommandSearch.displayName = "CommandSearch";
