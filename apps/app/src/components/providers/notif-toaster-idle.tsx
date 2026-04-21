"use client";

import { NotifToaster } from "@v1/ui/sonner-notif";
import { useEffect, useState } from "react";

export function NotifToasterIdle() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const markReady = () => {
      setIsReady(true);
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(markReady, { timeout: 2_000 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timer = setTimeout(markReady, 300);
    return () => clearTimeout(timer);
  }, []);

  if (!isReady) return null;

  return <NotifToaster position="top-center" offset={-10} />;
}
