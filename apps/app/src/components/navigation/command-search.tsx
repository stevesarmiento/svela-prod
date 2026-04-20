import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useState } from "react";
import { CommandSearchTrigger } from "./command-search-trigger";

import type { CommandContext } from "./bottom-nav-context";

interface CommandSearchProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onCommandSelect: (value: string, setIsOpen: (open: boolean) => void) => void;
  context?: CommandContext;
}

function loadCommandSearchPopoverContent() {
  return import("./command-search-popover-content");
}

const LazyCommandSearchPopoverContent = dynamic(
  () =>
    loadCommandSearchPopoverContent().then(
      (module) => module.CommandSearchPopoverContent,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

export const CommandSearch = React.memo(function CommandSearch(
  props: CommandSearchProps,
) {
  const [shouldLoadContent, setShouldLoadContent] = useState(props.isOpen);

  const preloadContent = useCallback(() => {
    if (shouldLoadContent) return;
    setShouldLoadContent(true);
    void loadCommandSearchPopoverContent();
  }, [shouldLoadContent]);

  const openSearch = useCallback(() => {
    preloadContent();
    props.setIsOpen(true);
  }, [preloadContent, props]);

  useEffect(() => {
    if (!props.isOpen) return;
    preloadContent();
  }, [preloadContent, props.isOpen]);

  if (!shouldLoadContent) {
    return (
      <CommandSearchTrigger onIntent={preloadContent} onOpen={openSearch} />
    );
  }

  return (
    <LazyCommandSearchPopoverContent
      isOpen={props.isOpen}
      setIsOpen={props.setIsOpen}
      onCommandSelect={props.onCommandSelect}
      context={props.context}
    />
  );
});

CommandSearch.displayName = "CommandSearch";
