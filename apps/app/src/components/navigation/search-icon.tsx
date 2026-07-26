import { cn } from "@v1/ui/cn";

interface SearchIconProps {
  className?: string;
}

/** Filled search glyph for bottom nav / command list (viewBox 32×32). */
export function SearchIcon({ className }: SearchIconProps) {
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
        d="M8 15.22C8 11.23 11.23 8 15.22 8C19.21 8 22.44 11.23 22.44 15.22C22.44 19.21 19.21 22.44 15.22 22.44C11.23 22.44 8 19.21 8 15.22ZM15.22 5.33C9.76 5.33 5.33 9.76 5.33 15.22C5.33 20.68 9.76 25.11 15.22 25.11C17.47 25.11 19.55 24.36 21.21 23.09L24.39 26.28C24.91 26.8 25.76 26.8 26.28 26.28C26.8 25.76 26.8 24.91 26.28 24.39L23.09 21.21C24.36 19.55 25.11 17.47 25.11 15.22C25.11 9.76 20.68 5.33 15.22 5.33Z"
        fill="currentColor"
      />
    </svg>
  );
}
