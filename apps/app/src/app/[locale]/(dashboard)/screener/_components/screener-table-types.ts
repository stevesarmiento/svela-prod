export interface ScreenerTableStatus {
  kind: "interpreting" | "loadingDerivatives";
  text: string;
}

export interface ScreenerTableMeta {
  tokenHeaderCountBadge?: { count: number } | null;
}

/**
 * Optional per-column layout/behavior metadata, replacing the old
 * index-based `.slice()` cell selection in header/row rendering.
 */
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    /** Horizontal alignment for header + cells (default "right"). */
    align?: "left" | "right";
    /**
     * Cell hosts its own interactive control — row-link clicks/keys are
     * swallowed so the control receives them (previously "the last cell").
     */
    interactive?: boolean;
  }
}
