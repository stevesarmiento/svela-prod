import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-1 h-5 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-amber-500/20 text-white hover:bg-amber-500/30",
        secondary:
          "border-transparent bg-blue-500/20 text-blue-500 hover:bg-blue-500/30",
        success:
          "border-transparent bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30",
        destructive:
          "border-transparent bg-rose-500/20 text-rose-500 hover:bg-rose-500/30",
        outline: "text-foreground",
        tag: "font-mono text-[#878787] bg-[#F2F1EF] text-[10px] dark:bg-[#1D1D1D] border-none font-normal rounded-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
