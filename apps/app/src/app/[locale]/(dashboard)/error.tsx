"use client";

import { useEffect } from "react";
import { Button } from "@v1/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
            Something went wrong
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Please try again. If this keeps happening, refreshing the page usually fixes it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={() => location.reload()}>
            Refresh page
          </Button>
        </div>
      </div>
    </div>
  );
}

