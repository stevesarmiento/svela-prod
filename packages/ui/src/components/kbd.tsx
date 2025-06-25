import React from 'react';
import { cn } from '@v1/ui/cn';

interface KbdProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export function Kbd({ children, className, ...props }: KbdProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-5 gap-1 p-0 px-2 text-[10px] text-white/50 font-mono bg-zinc-800/50 border border-zinc-800/50 rounded-sm",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}