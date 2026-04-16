"use client"

import Image from "next/image"
import { cn } from "@v1/ui/cn"

interface TokenLogoProps {
  src?: string | null
  alt: string
  sizePx: number
  className?: string
  /** Used for the fallback letter avatar when the image is missing or fails. */
  fallbackText?: string
  /**
   * Optionally bypass Next image optimization for remote logos.
   * Useful when the optimizer cold-cache adds noticeable latency for many tiny icons.
   */
  unoptimizedRemote?: boolean
  quality?: number
}

function isSafeImageSrc(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/")
}

function isRemoteSrc(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://")
}

function getFallbackLetter(text: string | undefined): string {
  const trimmed = text?.trim()
  if (!trimmed) return "?"
  return trimmed.slice(0, 1).toUpperCase()
}

export function TokenLogo({
  src,
  alt,
  sizePx,
  className,
  fallbackText,
  unoptimizedRemote,
  quality = 70,
}: TokenLogoProps) {
  const safeSrc = typeof src === "string" && isSafeImageSrc(src) ? src : null
  const envUnoptimized = process.env.NEXT_PUBLIC_UNOPTIMIZED_REMOTE_TOKEN_LOGOS === "1"
  const devUnoptimized = process.env.NODE_ENV !== "production" && sizePx <= 32
  const preferUnoptimized = unoptimizedRemote ?? (envUnoptimized || devUnoptimized)
  const shouldUnoptimize = Boolean(preferUnoptimized && safeSrc && isRemoteSrc(safeSrc))
  const shouldUnoptimizeSvg = Boolean(safeSrc?.toLowerCase().endsWith(".svg"))
  const isUnoptimized = shouldUnoptimize || shouldUnoptimizeSvg

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-primary/10 ring-1 ring-border",
        className,
      )}
      style={{ width: sizePx, height: sizePx }}
      aria-label={alt}
    >
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
        {getFallbackLetter(fallbackText ?? alt)}
      </div>

      {safeSrc ? (
        <Image
          src={safeSrc}
          alt={alt}
          fill
          sizes={`${sizePx}px`}
          quality={quality}
          unoptimized={isUnoptimized}
          className="object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.style.display = "none"
          }}
        />
      ) : null}
    </div>
  )
}
