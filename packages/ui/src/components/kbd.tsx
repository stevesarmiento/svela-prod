import { cn } from "@v1/ui/cn";
import type React from "react";
import { IconShiftFill } from "symbols-react";

interface KbdProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

function isShiftChild(children: React.ReactNode): boolean {
  return (
    typeof children === "string" && children.trim().toLowerCase() === "shift"
  );
}

export function Kbd({ children, className, ...props }: KbdProps) {
  const content = isShiftChild(children) ? (
    <>
      <IconShiftFill
        className="size-2.5 shrink-0 fill-current"
        aria-hidden="true"
      />
      <span className="sr-only">Shift</span>
    </>
  ) : (
    children
  );

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center size-5 gap-1 p-0 !text-[10px] text-white/50 font-diatype-bold bg-zinc-800/50 border border-zinc-800/90 dark:bg-zinc-870/80 dark:border-zinc-700/80 rounded-sm",
        className,
      )}
      {...props}
    >
      {content}
    </span>
  );
}
