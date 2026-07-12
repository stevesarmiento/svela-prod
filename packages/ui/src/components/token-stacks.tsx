/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import { cn } from "../utils";

interface Avatar {
  imageUrl: string;
  profileUrl: string;
}
interface AvatarCirclesProps {
  className?: string;
  numPeople?: number;
  avatarUrls: Avatar[];
}

export const AvatarCircles = ({
  numPeople,
  className,
  avatarUrls,
}: AvatarCirclesProps) => {
  const filteredUrls = avatarUrls.filter(
    (url) =>
      url.imageUrl &&
      (url.imageUrl.startsWith("http") || url.imageUrl.startsWith("/")),
  );
  // Overlapping row paints later siblings on top by default; bump z-index for earlier items so the first URL is the visible front token.
  const stackDepth = filteredUrls.length;

  return (
    <div
      className={cn("z-10 flex -space-x-2.5 rtl:space-x-reverse ", className)}
    >
      {filteredUrls.map((url, index) => (
        <div
          key={url.imageUrl}
          className="relative size-8 overflow-hidden rounded-full bg-muted/30 shadow-sm shadow-black/10"
          style={{ zIndex: stackDepth - index }}
        >
          <Image
            className="size-full object-cover"
            src={url.imageUrl}
            width={32}
            height={32}
            sizes="32px"
            alt={`Avatar ${index + 1}`}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
          {/* Inset translucent rim: tints with each token’s colors (no fixed border color). */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1.25px_oklch(0_0_0_/_0.55)] dark:shadow-[inset_0_0_0_0.7px_oklch(0_0_0_/_0.4)]"
          />
        </div>
      ))}
      {(numPeople ?? 0) > 0 && (
        <div className="flex size-8 items-center justify-center rounded-full border dark:border-white/10 border-zinc-800/10 dark:bg-background bg-zinc-950/5 backdrop-blur-xl text-center text-sm font-bold text-white font-berkeley-mono">
          <span className="opacity-50 text-xs">+</span>
          {numPeople}
        </div>
      )}
    </div>
  );
};
