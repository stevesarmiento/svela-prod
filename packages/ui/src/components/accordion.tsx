"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "../utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border-b border-border", className)}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

interface AccordionTriggerProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> {
  chevronBefore?: boolean;
}

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  AccordionTriggerProps
>(({ className, children, chevronBefore, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex w-full">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 items-center justify-between py-4 font-medium [&>svg]:transition-transform [&>svg]:duration-[var(--duration-ui)] [&[data-state=open]>svg]:rotate-180",
        chevronBefore && "[&[data-state=open]>svg]:rotate-0",
        className,
      )}
      {...props}
    >
      {chevronBefore && (
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 -rotate-90" />
      )}
      {children}
      {!chevronBefore && (
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
      )}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    forceMount
    ref={ref}
    className={cn(
      "grid text-sm grid-rows-[0fr] data-[state=open]:grid-rows-[1fr] data-[state=closed]:invisible transition-[grid-template-rows,visibility] duration-[var(--duration-ui)] ease-[var(--ease-out-cubic)] [&[hidden]]:grid",
      className,
    )}
    {...props}
  >
    <div className="min-h-0 overflow-hidden">
      <div className="pb-4 pt-0">{children}</div>
    </div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
