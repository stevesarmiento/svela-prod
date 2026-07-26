import type { SVGProps } from "react";

/**
 * Analyze / deep-analysis glyph (reply arrow over text lines). Paths carry no
 * fill so Tailwind `fill-*` utilities on the element color it, matching how
 * symbols-react icons are styled across the app.
 */
export function IconAnalyze(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.25 12.01L11.75 9.75L11.75 14.29L14.25 12.01Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1.75 1C2.16 1 2.5 1.34 2.5 1.75V8C2.5 9.79 3.96 11.25 5.75 11.25H11V9.75C11 9.45 11.17 9.18 11.45 9.06C11.72 8.94 12.03 9 12.25 9.19L14.75 11.43C14.91 11.57 15 11.77 15 11.98C15 12.19 14.91 12.39 14.76 12.54L12.26 14.8C12.04 15 11.72 15.06 11.45 14.94C11.18 14.82 11 14.55 11 14.25V12.75H5.75C3.13 12.75 1 10.62 1 8V1.75C1 1.34 1.34 1 1.75 1Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.25 6C8.66 6 9 6.34 9 6.75C9 7.16 8.66 7.5 8.25 7.5H5.75C5.34 7.5 5 7.16 5 6.75C5 6.34 5.34 6 5.75 6H8.25Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.25 2C11.66 2 12 2.34 12 2.75C12 3.16 11.66 3.5 11.25 3.5H5.75C5.34 3.5 5 3.16 5 2.75C5 2.34 5.34 2 5.75 2H11.25Z"
      />
    </svg>
  );
}
