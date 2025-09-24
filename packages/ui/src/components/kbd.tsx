import React from 'react';
import { cn } from '@v1/ui/cn';

interface KbdProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export function Kbd({ children, className, ...props }: KbdProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-5 gap-1 p-0 px-2 text-[10px] text-white/50 font-diatype-mono bg-zinc-800/10 border border-zinc-800/20 dark:bg-zinc-800/50 dark:border-zinc-800/50 rounded-sm",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}