"use client";

import { useEffect, useRef } from "react";
import {
  getSharedGl,
  lightnessOf,
  parseColor,
  phaseOffsetFor,
  registerShineTarget,
  sweepDurationMs,
} from "@/lib/card-shine/renderer";

interface CardLoadingShineProps {
  /** Stable identity used to stagger this card's sweep against its neighbours. */
  phaseKey: string;
}

/**
 * Loading highlight for a card: the Rex docs "copy code" shine, replayed while
 * the parent is loading. Render inside a `position: relative; overflow: hidden`
 * parent; it measures that parent for size, corner radius and fill colour.
 *
 * Draws nothing under `prefers-reduced-motion: reduce` or without WebGL.
 */
export function CardLoadingShine({ phaseKey }: CardLoadingShineProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!getSharedGl()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let unregister: (() => void) | null = null;

    const mount = () => {
      unregister?.();
      const width = parent.offsetWidth;
      const height = parent.offsetHeight;
      if (width === 0 || height === 0) return;
      const style = getComputedStyle(parent);
      const line =
        Number.parseFloat(style.lineHeight) ||
        Number.parseFloat(style.fontSize) * 1.5;
      const radius = Math.min(
        Number.parseFloat(style.borderTopLeftRadius) || 0,
        width / 2,
        height / 2,
      );
      const fill = parseColor(
        style.getPropertyValue("--fill").trim() || style.backgroundColor,
      );
      const lightFill = lightnessOf(fill);
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.style.mixBlendMode = lightFill > 0.5 ? "multiply" : "normal";

      unregister = registerShineTarget({
        ctx,
        width: canvas.width,
        height: canvas.height,
        line: line * dpr,
        radius: radius * dpr,
        lightFill,
        tint: parseColor(style.getPropertyValue("--primary").trim() || "#000"),
        phaseOffset: phaseOffsetFor(phaseKey),
        durationMs: sweepDurationMs(width, height, line),
      });
    };

    mount();
    const observer = new ResizeObserver(mount);
    observer.observe(parent);
    return () => {
      observer.disconnect();
      unregister?.();
    };
  }, [phaseKey]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-[1]"
    />
  );
}
