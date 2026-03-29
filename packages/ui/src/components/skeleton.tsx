import type * as React from "react";
import { cn } from "../utils";

function Skeleton({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-primary/10 rounded-lg opacity-50",
        className,
      )}
      {...props}
    >
      <div className="ck-qr-shine" />
      {children}
    </div>
  );
}

export { Skeleton };
