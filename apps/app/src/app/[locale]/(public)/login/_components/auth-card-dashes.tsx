import type * as React from "react";

const SVG_STYLE: React.CSSProperties = {
  width: "200vw",
  height: "200vh",
};

export function AuthCardDashes(): React.JSX.Element {
  return (
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          left: "0%",
          top: "0%",
          transform: "translate(-50%, -50%)",
          ...SVG_STYLE,
        }}
      >
        <line
          x1="0"
          y1="50%"
          x2="100%"
          y2="50%"
          className="stroke-border group-hover:stroke-border"
          strokeWidth={1}
          strokeDasharray="7 7"
        />
        <line
          x1="50%"
          y1="0"
          x2="50%"
          y2="100%"
          className="stroke-border group-hover:stroke-border"
          strokeWidth={1}
          strokeDasharray="7 7"
        />
      </svg>

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          left: "100%",
          top: "100%",
          transform: "translate(-50%, -50%)",
          ...SVG_STYLE,
        }}
      >
        <line
          x1="0"
          y1="50%"
          x2="100%"
          y2="50%"
          className="stroke-border group-hover:stroke-border"
          strokeWidth={1}
          strokeDasharray="7 7"
        />
        <line
          x1="50%"
          y1="0"
          x2="50%"
          y2="100%"
          className="stroke-border group-hover:stroke-border"
          strokeWidth={1}
          strokeDasharray="7 7"
        />
      </svg>
    </>
  );
}

