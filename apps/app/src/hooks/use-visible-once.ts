"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * Becomes true once the referenced element first intersects the viewport
 * (and stays true). Used to defer loading heavy inline cells until visible.
 * Environments without IntersectionObserver load immediately.
 */
export function useVisibleOnce<T extends Element>(options?: {
  rootMargin?: string;
  threshold?: number;
}): { ref: RefObject<T | null>; visible: boolean } {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  const rootMargin = options?.rootMargin ?? "250px 0px";
  const threshold = options?.threshold ?? 0.01;

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver !== "function") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin, threshold]);

  return { ref, visible };
}
