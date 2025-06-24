import React from 'react';
import { cn } from '@v1/ui/cn';

interface KbdProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export function Kbd({ children, className, ...props }: KbdProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-muted/50 border border-border rounded-sm text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}