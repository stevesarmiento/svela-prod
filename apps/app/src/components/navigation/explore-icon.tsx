import { cn } from "@v1/ui/cn";

interface ExploreIconProps {
  className?: string;
}

/** Filled explore glyph for bottom nav / command list (viewBox 32x32). */
export function ExploreIcon({ className }: ExploreIconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 16C4 9.37 9.37 4 16 4C22.63 4 28 9.37 28 16C28 22.63 22.63 28 16 28C9.37 28 4 22.63 4 16ZM20.62 10.39C21.37 10.15 22.07 10.85 21.83 11.6L20.21 16.61C19.99 17.29 19.12 17.5 18.61 16.99L15.23 13.61C14.72 13.1 14.93 12.23 15.61 12.01L20.62 10.39ZM10.39 20.62C10.15 21.36 10.85 22.07 11.6 21.83L16.61 20.21C17.29 19.99 17.5 19.12 16.99 18.61L13.61 15.23C13.1 14.72 12.23 14.92 12.01 15.61L10.39 20.62Z"
        fill="currentColor"
      />
    </svg>
  );
}
