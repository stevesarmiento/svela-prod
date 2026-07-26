import { cn } from "@v1/ui/cn";

interface BookmarkIconProps {
  className?: string;
}

/** Filled bookmark glyph for bottom nav / command list (viewBox 32×32). */
export function BookmarkIcon({ className }: BookmarkIconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M17.04 22.51L21.57 26.89C22.5 27.8 24.06 27.17 24.1 25.87C24.17 23.22 24.25 19.54 24.25 16.75C24.25 13.73 24.15 9.67 24.08 7C24.04 5.45 22.8 4.19 21.25 4.13C19.62 4.06 17.59 4 16 4C14.41 4 12.38 4.06 10.75 4.13C9.2 4.19 7.96 5.45 7.92 7C7.85 9.67 7.75 13.73 7.75 16.75C7.75 19.54 7.83 23.22 7.9 25.87C7.94 27.17 9.5 27.8 10.43 26.89L14.96 22.51C15.54 21.94 16.46 21.94 17.04 22.51Z"
        fill="currentColor"
      />
    </svg>
  );
}
