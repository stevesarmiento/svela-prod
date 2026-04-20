"use client";

import type React from "react";

interface TopNavShellProps {
  leftSlot: React.ReactNode;
  rightSlot?: React.ReactNode;
}

export function TopNavShell(props: TopNavShellProps) {
  return (
    <div className="py-12 px-4">
      <div className="flex h-16 items-center px-4 gap-4">
        <div className="flex items-center gap-3">{props.leftSlot}</div>
        <div className="flex-1" />
        {props.rightSlot ? (
          <div className="flex items-center gap-2">{props.rightSlot}</div>
        ) : null}
      </div>
    </div>
  );
}
