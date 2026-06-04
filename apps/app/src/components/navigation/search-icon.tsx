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
        d="M7.99992 15.2223C7.99992 11.2335 11.2334 8.00004 15.2222 8.00004C19.2109 8.00004 22.4443 11.2335 22.4443 15.2223C22.4443 19.211 19.2109 22.4444 15.2222 22.4444C11.2334 22.4444 7.99992 19.211 7.99992 15.2223ZM15.2222 5.33337C9.76065 5.33337 5.33325 9.76077 5.33325 15.2223C5.33325 20.6838 9.76065 25.1111 15.2222 25.1111C17.4722 25.1111 19.5466 24.3598 21.2083 23.094L24.3905 26.2762C24.9111 26.7968 25.7554 26.7968 26.2761 26.2762C26.7967 25.7555 26.7967 24.9112 26.2761 24.3906L23.0939 21.2084C24.3597 19.5467 25.111 17.4723 25.111 15.2223C25.111 9.76077 20.6837 5.33337 15.2222 5.33337Z"
        fill="currentColor"
      />
    </svg>
  );
}
