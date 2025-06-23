"use client";

import { Avatar, AvatarFallback } from "@v1/ui/avatar";
import { SpinnerEllipsis } from "@v1/ui/spinner-ellipsis";
import Image from "next/image";

export function ChatLoading() {
  return (
    <div className="flex gap-3 justify-start items-center">
      <Avatar className="size-8">
        <AvatarFallback>
          <Image 
            src="/svela-logo.svg" 
            alt="Svela" 
            width={16} 
            height={16}
            className="opacity-70"
          />
        </AvatarFallback>
      </Avatar>
      <SpinnerEllipsis className="fill-zinc-800/50" />
    </div>
  );
} 