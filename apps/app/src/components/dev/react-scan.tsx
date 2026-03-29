"use client";

import { useEffect } from "react";

export function ReactScan(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-react-scan="true"]',
    );
    if (existing) return;

    const script = document.createElement("script");
    script.dataset.reactScan = "true";
    script.src = "https://unpkg.com/react-scan/dist/auto.global.js";
    script.async = true;

    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return null;
}

