"use client";

import { Avatar, AvatarFallback } from "@v1/ui/avatar";
import { SpinnerEllipsis } from "@v1/ui/spinner-ellipsis";
import { SvelaLogo } from "@v1/ui/svela-logo";

export function ChatLoading() {
  return (
    <div className="flex gap-3 justify-start items-center">
      <Avatar className="size-8">
      <AvatarFallback className="bg-zinc-800 border/50 border-zinc-700/50 p-1.5">
            <SvelaLogo
              width={20} 
              height={20}
              adaptive={true}
            />
        </AvatarFallback>
      </Avatar>
      <SpinnerEllipsis className="fill-zinc-800/50" />
    </div>
  );
} 