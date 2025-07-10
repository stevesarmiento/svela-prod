"use client";

import { ChatMessageList } from "./chat-message-list";
import { ChatInput } from "./chat-input";
import type { Message } from "ai";

// Import the ComponentData type
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

interface ConversationViewProps {
  messages: Message[];
  input: string;
  isLoading: boolean;
  isDataLoading: boolean;
  error: Error | null;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  userImage?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  componentData?: ComponentData | null;
  messageComponents?: Record<string, ComponentData>;
}

export function ConversationView({
  messages,
  input,
  isLoading,
  isDataLoading,
  error,
  onInputChange,
  onSubmit,
  userImage,
  userName,
  componentData,
  messageComponents,
}: ConversationViewProps) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="h-[600px] flex flex-col">
        <ChatMessageList 
          messages={messages}
          isLoading={isLoading}
          isDataLoading={isDataLoading}
          userImage={userImage}
          userName={userName}
          messageComponents={messageComponents}
          componentData={componentData}
        />
        
        <div className="relative border border-white/5 p-2 rounded-[30px]">
          <ChatInput
            input={input}
            isLoading={isLoading}
            isDataLoading={isDataLoading}
            onInputChange={onInputChange}
            onSubmit={onSubmit}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}