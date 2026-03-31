"use client";

import { ScrollArea } from "@v1/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { ChatLoading } from "./chat-loading";
import { useAutoScroll } from "./hooks/use-auto-scroll";
import { isTextUIPart, type UIMessage } from "ai";
import type { ComponentData } from "./types";


interface ChatMessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  isDataLoading: boolean;
  userImage?: string | null;
  userName?: string | null;
  componentData?: ComponentData | null;
  messageComponents?: Record<string, ComponentData>;
}

export function ChatMessageList({ messages, isLoading, isDataLoading, messageComponents }: ChatMessageListProps) {
  // ✅ FIXED: Replaced setInterval anti-pattern with optimized useAutoScroll hook
  // Uses requestAnimationFrame for 60fps smooth performance instead of 10 timer calls/second
  const { scrollElementRef } = useAutoScroll({
    dependencies: [messages.length, isLoading, isDataLoading],
    enabled: true,
    smooth: true
  });

  // Handler to connect Radix ScrollArea with our scroll hook
  const handleScrollAreaRef = (element: HTMLDivElement | null) => {
    if (element && scrollElementRef) {
      // Find the actual scroll viewport element inside Radix ScrollArea
      const viewport = element.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (viewport) {
        scrollElementRef.current = viewport;
      }
    }
  };

  return (
    <ScrollArea ref={handleScrollAreaRef} className="flex-1 px-4">
      <div className="space-y-4 pb-4 cv-auto">
        {messages.map((message) => {
          // Get component data for this message
          const componentData = messageComponents?.[message.id] || null;
          const content = message.parts
            .filter(isTextUIPart)
            .map((part) => part.text)
            .join('');
          
          return (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={content}
              componentData={componentData}
            />
          );
        })}
        {(isLoading || isDataLoading) && <ChatLoading />}
      </div>
    </ScrollArea>
  );
}