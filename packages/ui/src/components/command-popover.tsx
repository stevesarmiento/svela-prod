"use client";

import { Command as CommandPrimitive } from "cmdk";
import * as React from "react";
import { type RefObject, useRef } from "react";
import useClickOutside from "../hooks/use-click-outside";
import { cn } from "../utils";
import { Popover, PopoverContentWithoutPortal, PopoverTrigger } from "./popover";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden text-popover-foreground",
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

interface CommandPopoverProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  shouldFilter?: boolean;
  /**
   * Controlled highlight (cmdk `value`). Useful with async item lists: when
   * results replace the list, cmdk's highlight can point at an unmounted item
   * and Enter silently no-ops — control it to re-anchor on the first result.
   * cmdk normalizes item values with trim().toLowerCase(); pass values in
   * that form.
   */
  value?: string;
  onValueChange?: (value: string) => void;
}

const CommandPopover = ({
  children,
  open,
  onOpenChange,
  trigger,
  shouldFilter = true,
  value,
  onValueChange,
}: CommandPopoverProps) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useClickOutside(contentRef as RefObject<HTMLElement>, (event) => {
    // Prevent closing when clicking on the input
    const target = event.target as HTMLElement;
    if (target.closest("[cmdk-input-wrapper]")) return;

    if (open) onOpenChange(false);
  });

  return (
    <Command
      className="relative"
      shouldFilter={shouldFilter}
      value={value}
      onValueChange={onValueChange}
    >
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        {/* No portal: cmdk's keyboard selection walks the DOM under <Command>,
            so the list must stay inside that subtree. Portaling it to <body>
            silently breaks ↑/↓/Enter (items are never found). */}
        <PopoverContentWithoutPortal
          ref={contentRef}
          className="dark relative rounded-[20px] bg-zinc-900 border border-transparent overflow-hidden p-1 w-full sm:w-[499px] max-w-[calc(100vw-2rem)] z-[1000] data-[state=open]:animate-none data-[state=closed]:animate-none
                     text-popover-foreground shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_30px_oklch(0.2978_0.0083_317.72_/_0.9),0_4px_16px_oklch(0_0_0_/_0.4)]"
          side="bottom"
          sideOffset={12}
          // Keep focus on the cmdk input (trigger) so typing + arrow selection work; don't jump into the list.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {/* Background Pattern - FIRST (behind everything) */}
          <div
            className="absolute inset-0 opacity-5 dark:opacity-5 z-0"
            style={{
              backgroundImage: `
                radial-gradient(circle at 25% 25%, oklch(0 0 0) 1px, transparent 1px),
                radial-gradient(circle at 75% 75%, oklch(0 0 0) 1px, transparent 1px)
              `,
              backgroundSize: "24px 24px",
            }}
          />
          <div
            className="absolute inset-0 opacity-5 dark:opacity-0 z-0"
            style={{
              backgroundImage: `
                radial-gradient(circle at 25% 25%, oklch(1 0 0) 1px, transparent 1px),
                radial-gradient(circle at 75% 75%, oklch(1 0 0) 1px, transparent 1px)
              `,
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative z-10">{children}</div>
        </PopoverContentWithoutPortal>
      </Popover>
    </Command>
  );
};

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center w-full" cmdk-input-wrapper="">
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
    <CommandShortcut className="sr-only">⌘K</CommandShortcut>
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm"
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 h-px bg-border", className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center px-2 py-1.5 text-sm outline-none aria-selected:bg-gray-100/80 dark:aria-selected:bg-zinc-800/30 rounded-2xl aria-selected:text-gray-900 dark:aria-selected:text-white active:scale-[0.98] transition-transform duration-[var(--duration-micro)] ease-[var(--ease-out-cubic)]",
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
};
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandPopover,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
};
