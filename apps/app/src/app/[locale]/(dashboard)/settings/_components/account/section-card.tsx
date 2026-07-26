"use client";

import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  children: ReactNode;
}

/**
 * Shared section chrome matching the app's settings design language
 * (see api-keys-management.tsx).
 */
export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <div className="rounded-[10px] bg-primary/5 overflow-hidden p-0.5">
      {/* Header */}
      <div className="px-3 py-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <span>{title}</span>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}
