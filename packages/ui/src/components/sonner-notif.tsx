"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  IconCheckmarkCircleFill,
  IconExclamationmarkCircleFill,
  IconExclamationmarkTriangleFill,
  IconInfoCircleFill,
} from "symbols-react";
import { cn } from "../utils";
import { Spinner } from "./spinner";

interface NotifToasterProps extends ToasterProps {
  iconClassNames?: Partial<
    Record<"success" | "error" | "info" | "warning" | "loading", string>
  >;
}

const NotifToaster = ({ iconClassNames, ...props }: NotifToasterProps) => {
  const { theme = "system", resolvedTheme } = useTheme();
  const sonnerTheme: ToasterProps["theme"] =
    theme === "system"
      ? "system"
      : theme === "dark"
        ? "dark"
        : resolvedTheme === "dark"
          ? "dark"
          : "light";

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster group"
      icons={{
        success: (
          <IconCheckmarkCircleFill
            className={cn("size-4 fill-emerald-500", iconClassNames?.success)}
          />
        ),
        error: (
          <IconExclamationmarkCircleFill
            className={cn("size-4 fill-red-500", iconClassNames?.error)}
          />
        ),
        info: (
          <IconInfoCircleFill
            className={cn("size-4 fill-blue-500", iconClassNames?.info)}
          />
        ),
        warning: (
          <IconExclamationmarkTriangleFill
            className={cn("size-4 fill-amber-500", iconClassNames?.warning)}
          />
        ),
        loading: (
          <Spinner
            size={16}
            className={cn("text-muted-foreground", iconClassNames?.loading)}
          />
        ),
      }}
      style={
        {
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--popover-foreground))",
          "--normal-border": "hsl(var(--border))",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "group rounded-[20px] border px-4 py-2 shadow-sm mt-6",
          icon: "shrink-0",
          title: "text-sm font-medium",
          description: "text-xs text-muted-foreground",
          actionButton: "h-8 px-3 text-xs",
          cancelButton: "h-8 px-3 text-xs",
          closeButton: "h-7 w-7",
        },
      }}
      {...props}
    />
  );
};

export { NotifToaster };
