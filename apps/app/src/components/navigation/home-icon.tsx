import { cn } from "@v1/ui/cn";

interface HomeIconProps {
  className?: string;
}

/** Filled home glyph for bottom nav / command list (viewBox 32×32). */
export function HomeIcon({ className }: HomeIconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M15.08 4.38L5.62 13.41C5.22 13.79 5 14.31 5 14.86V25.67C5 26.4 5.6 27 6.33 27H12C12.37 27 12.67 26.7 12.67 26.33V20.33C12.67 18.68 14.01 17.33 15.67 17.33H16C17.66 17.33 19 18.68 19 20.33V26.33C19 26.7 19.3 27 19.67 27H25.67C26.4 27 27 26.4 27 25.67V14.86C27 14.31 26.78 13.79 26.38 13.41L16.92 4.38C16.41 3.89 15.59 3.89 15.08 4.38Z"
        fill="currentColor"
      />
    </svg>
  );
}
