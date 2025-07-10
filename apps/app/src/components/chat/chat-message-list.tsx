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

interface ComparisonChartData {
  coins: Array<{
    id: number;
    name: string;
    symbol: string;
    price: number;
    change24h: number;
    marketCap: number;
    volume24h: number;
    rank: number;
    historical?: {
      timeframe: string;
      prices: Array<{
        timestamp: number;
        price: number;
      }>;
      volumes?: Array<{
        timestamp: number;
        volume: number;
      }>;
    };
  }>;
  timeframe: string;
  chartType?: string;
}

interface ComponentData {
  type: 'price_card' | 'comparison_chart';
  data: PriceCardData | ComparisonChartData;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom function
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages.length]); // Trigger on message count change

  // Auto-scroll during streaming (when content changes)
  useEffect(() => {
    const timer = setInterval(() => {
      if (isLoading) {
        scrollToBottom();
      }
    }, 100); // Check every 100ms during loading

    return () => clearInterval(timer);
  }, [isLoading]);

  // Scroll when loading states change
  useEffect(() => {
    if (isLoading || isDataLoading) {
      setTimeout(scrollToBottom, 100);
    }
  }, [isLoading, isDataLoading]);

  return (
    <div className="h-full overflow-hidden p-4">
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
            <ChatLoading />
          )}
          
          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
    </div>
  );
}