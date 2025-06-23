"use client";

import { useRef, useEffect } from "react";
import { ScrollArea } from "@v1/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { ChatLoading } from "./chat-loading";
import type { Message } from "ai";

interface PriceCardData {
  id: number;
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  marketCap?: number;
  volume24h?: number;
  rank?: number;
}

interface ComponentData {
  type: 'price_card';
  data: PriceCardData;
}

interface ChatMessageListProps {
  messages: Message[];
  isLoading: boolean;
  isDataLoading: boolean;
  userImage?: string | null;
  userName?: string | null;
  componentData?: ComponentData | null;
  messageComponents?: Record<string, ComponentData>;
}

export function ChatMessageList({ messages, isLoading, isDataLoading, messageComponents }: ChatMessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  return (
    <div className="flex-1 overflow-hidden p-4">
      <ScrollArea className="h-full pr-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role as 'user' | 'assistant' | 'system' | 'data'}
              content={message.content}
              componentData={messageComponents?.[message.id] || null}
            />
          ))}
          
          {(isLoading || isDataLoading) && (
            <ChatLoading isDataLoading={isDataLoading} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}