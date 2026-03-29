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
  return (
    <div className={cn("z-10 flex -space-x-4 rtl:space-x-reverse ", className)}>
      {avatarUrls
        .filter(
          (url) =>
            url.imageUrl &&
            (url.imageUrl.startsWith("http") || url.imageUrl.startsWith("/")),
        )
        .map((url, index) => (
          <div
            key={url.imageUrl}
            className="h-8 w-8 rounded-full border dark:border-white/5 border-zinc-950/10 bg-background backdrop-blur-xl shadow-sm shadow-black/10"
          >
            <Image
              className="rounded-full"
              src={url.imageUrl}
              width={50}
              height={50}
              alt={`Avatar ${index + 1}`}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
          </div>
        ))}
      {(numPeople ?? 0) > 0 && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border dark:border-white/10 border-zinc-800/10 dark:bg-background bg-zinc-950/5 backdrop-blur-xl text-center text-sm font-bold text-white font-diatype-mono">
          <span className="opacity-50 text-xs">+</span>
          {numPeople}
        </div>
      )}
    </div>
  );
};
