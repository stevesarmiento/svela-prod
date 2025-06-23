"use client";

import { Avatar, AvatarFallback } from "@v1/ui/avatar";
import { Spinner } from "@v1/ui/spinner";
import Image from "next/image";

interface ChatLoadingProps {
  isDataLoading: boolean;
}

export function ChatLoading({ isDataLoading }: ChatLoadingProps) {
  return (
    <div className="flex gap-3 justify-start">
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
      <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
        <Spinner />
        <span className="text-sm text-muted-foreground">
          {isDataLoading ? 'Fetching live data...' : 'Thinking...'}
        </span>
      </div>
    </div>
  );
} 