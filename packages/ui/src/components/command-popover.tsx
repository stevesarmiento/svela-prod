"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { cn } from "../utils"
import { RefObject, useRef } from "react"
import useClickOutside from "../hooks/use-click-outside"

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
))
Command.displayName = CommandPrimitive.displayName

interface CommandPopoverProps {
  children: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactNode
  shouldFilter?: boolean
}

const CommandPopover = ({ 
  children, 
  open, 
  onOpenChange, 
  trigger, 
  shouldFilter = true
}: CommandPopoverProps) => {
  const contentRef = useRef<HTMLDivElement>(null)

  useClickOutside(contentRef as RefObject<HTMLElement>, (event) => {
    // Prevent closing when clicking on the input
    const target = event.target as HTMLElement
    if (target.closest('[cmdk-input-wrapper]')) return
    
    if (open) onOpenChange(false)
  })

  return (
    <Command className="relative" shouldFilter={shouldFilter}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          {trigger}
        </PopoverTrigger>
        <PopoverContent
          ref={contentRef}
          className="dark relative rounded-[20px] bg-zinc-900/95 backdrop-blur-md border border-transparent overflow-hidden p-1 w-[499px] z-[1000] data-[state=open]:slide-in-from-bottom-24 data-[state=closed]:slide-out-to-bottom-24
                     shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]"
          side="bottom"
          sideOffset={12}
        >
          {/* Background Pattern - FIRST (behind everything) */}
          <div className="absolute inset-0 opacity-5 dark:opacity-5 z-0"
            style={{
              backgroundImage: `
                radial-gradient(circle at 25% 25%, rgb(0 0 0) 1px, transparent 1px),
                radial-gradient(circle at 75% 75%, rgb(0 0 0) 1px, transparent 1px)
              `,
              backgroundSize: "24px 24px",
            }}
          />
          <div className="absolute inset-0 opacity-5 dark:opacity-0 z-0"
            style={{
              backgroundImage: `
                radial-gradient(circle at 25% 25%, rgb(255 255 255) 1px, transparent 1px),
                radial-gradient(circle at 75% 75%, rgb(255 255 255) 1px, transparent 1px)
              `,
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative z-10">
            {children}
          </div>
        </PopoverContent>
      </Popover>
    </Command>
  )
}

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
))
CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
    {...props}
  />
))
CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm"
    {...props}
  />
))
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

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
))
CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 h-px bg-border", className)}
    {...props}
  />
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center px-2 py-1.5 text-sm outline-none aria-selected:bg-gray-100/80 dark:aria-selected:bg-zinc-800/30 rounded-2xl aria-selected:text-gray-900 dark:aria-selected:text-white active:scale-[0.98] transition-all duration-150 ease-in-out",
      className,
    )}
    {...props}
  />
))
CommandItem.displayName = CommandPrimitive.Item.displayName

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
  )
}
CommandShortcut.displayName = "CommandShortcut"

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
}