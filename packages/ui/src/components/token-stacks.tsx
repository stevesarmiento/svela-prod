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
    <div className={cn("z-10 flex -space-x-4 rtl:space-x-reverse", className)}>
      {avatarUrls.filter(url => url.imageUrl && (url.imageUrl.startsWith('http') || url.imageUrl.startsWith('/'))).map((url, index) => (
        // <a
        //   key={index}
        //   href={url.profileUrl}
        //   target="_blank"
        //   rel="noopener noreferrer"
        // >
          <Image
            key={index}
            className="h-10 w-10 rounded-full border border-white/10 bg-background shadow-sm shadow-black/10"
            src={url.imageUrl}
            width={40}
            height={40}
            alt={`Avatar ${index + 1}`}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        // </a>
      ))}
      {(numPeople ?? 0) > 0 && (
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-background text-center text-sm font-bold text-white font-mono"
        >
          +{numPeople}
        </div>
      )}
    </div>
  );
};
