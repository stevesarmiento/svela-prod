import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center font-semibold outline outline-2 outline-offset-4 outline-transparent transition-all duration-150 ease-in-out active:scale-[0.98] disabled:opacity-80 disabled:cursor-not-allowed transition-all duration-150 ease-in-out",
  {
    variants: {
      variant: {
        default: "border-t rounded-lg border-white/20 bg-zinc-800 hover:bg-zinc-900 shadow-md active:shadow-sm shadow-black/60 ring-1 ring-zinc-700 dark:ring-zinc-700 text-white transition-colors duration-200 ease-in-out",
        destructive:
          "border-t rounded-lg border-white/40 bg-gradient-to-b from-rose-500 to-rose-500 shadow-md active:shadow-sm shadow-black/60 ring-1 ring-rose-700 dark:ring-rose-700 text-white",
        outline:
          "border rounded-lg border bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-primary/5",
        link: "text-primary/50 hover:text-primary underline-none transition-all duration-150 ease-in-out",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
  startIcon?: React.ReactNode
  endIcon?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, startIcon, endIcon, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {startIcon && <span className="mr-2">{startIcon}</span>}
        {children}
        {endIcon && <span className="ml-2">{endIcon}</span>}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
