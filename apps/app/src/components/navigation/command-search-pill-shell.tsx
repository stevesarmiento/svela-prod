import type { ReactNode } from "react";
import { BackgroundPattern } from "./background-pattern";

/**
 * The search pill's chrome next to the dock. Shared by the live command
 * palette and the login product preview.
 */
export function CommandSearchPillShell({ children }: { children: ReactNode }) {
  // NB: no backdrop-blur on the pill — bg-zinc-800 is fully opaque, the filter would burn paint time invisibly
  return (
    <div className="group relative rounded-[20px] bg-zinc-800 border border-transparent overflow-hidden px-2 py-0 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_30px_oklch(0.2978_0.0083_317.72_/_0.9),0_4px_16px_oklch(0_0_0_/_0.6)]">
      <BackgroundPattern />

      <div className="relative z-10">{children}</div>
    </div>
  );
}
