import { cn } from "@v1/ui/cn";
import { IconBinocularsFill } from "symbols-react";

interface ComparisonIconProps {
  className?: string;
}

/** Binoculars glyph for the Sector comparison tab in bottom nav / command list. */
export function ComparisonIcon({ className }: ComparisonIconProps) {
  return (
    <IconBinocularsFill
      className={cn("shrink-0 fill-current", className)}
      aria-hidden
    />
  );
}
