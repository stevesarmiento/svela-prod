import type { ReactNode } from "react";

/**
 * Overview page frame: sticky portfolio column on the left, feed on the right.
 * Shared by the live page and the login product preview.
 */
export function OverviewTwoColumnLayout({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="w-full px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-6 lg:self-start">
          {left}
        </div>

        <div className="space-y-4 lg:col-span-7">{right}</div>
      </div>
    </div>
  );
}
