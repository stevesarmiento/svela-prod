import { cn } from "@v1/ui/cn";

interface ComparisonIconProps {
  className?: string;
}

/** Stacked-layers glyph for the Watchlist comparison tab in bottom nav / command list (viewBox 33×33). */
export function ComparisonIcon({ className }: ComparisonIconProps) {
  return (
    <svg
      viewBox="0 0 33 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        d="M15.5364 5.71929L5.93001 11.323C4.66298 12.0621 4.66298 13.8928 5.93001 14.6319L15.5364 20.2356C16.1327 20.5835 16.8702 20.5835 17.4666 20.2356L27.0729 14.6319C28.34 13.8928 28.34 12.0621 27.0729 11.323L17.4666 5.71929C16.8702 5.3714 16.1327 5.3714 15.5364 5.71929Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.11597 18.1245L5.92977 19.3998C4.66273 20.1389 4.66273 21.9696 5.92977 22.7087L15.5361 28.3123C16.1325 28.6603 16.8699 28.6603 17.4664 28.3123L27.0727 22.7087C28.3397 21.9696 28.3397 20.1389 27.0727 19.3998L24.8867 18.1246L18.4316 21.89C17.2389 22.5858 15.764 22.5858 14.5712 21.89L8.11597 18.1245Z"
        fill="currentColor"
      />
    </svg>
  );
}
