"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@v1/ui/avatar";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@v1/convex/hooks";
import { PriceCard } from "./price-card";
import { ComparisonChart } from "./comparison-chart";

interface PriceCardData {
  id: number;
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  marketCap?: number;
  volume24h?: number;
  rank?: number;
  historical?: {
    data?: {
      quotes?: Array<{
        timestamp: string;
        quote: {
          USD: {
            price: number;
          };
        };
      }>;
    };
  };
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

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system' | 'data';
  content: string;
  id?: string;
  userImage?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  componentData?: ComponentData | null;
}

export function ChatMessage({ 
  role, 
  content, 
  userName, 
  userEmail, 
  componentData 
}: ChatMessageProps) {
  const { user } = useAuth();
  const avatarUrl = user?.avatarUrl || null;
  
  // Skip rendering data messages
  if (role === 'data') return null;

  return (
    <div
      className={`flex gap-3 ${
        role === 'user' ? 'justify-end' : 'justify-start'
      }`}
    >
      {role === 'assistant' && (
        <Avatar className="size-8 bg-transparent">
          <AvatarFallback>
            <Image 
              src="/svela-logo.svg" 
              alt="Svela" 
              width={15} 
              height={15}
              className="opacity-70"
            />
          </AvatarFallback>
        </Avatar>
      )}
      
      <div className={`max-w-[66%] space-y-3 ${role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Render component first if it's an assistant message and we have component data */}
        {role === 'assistant' && componentData?.type === 'price_card' && (
          <PriceCard {...(componentData.data as PriceCardData)} />
        )}
        {role === 'assistant' && componentData?.type === 'comparison_chart' && (
          <ComparisonChart {...(componentData.data as ComparisonChartData)} />
        )}
        
        <div
          className={`rounded-lg ${
            role === 'user'
              ? 'bg-gradient-to-br from-zinc-800/80 to-zinc-800/40 rounded-tr-none text-white px-4 py-2'
              : 'text-white'
          }`}
        >
          {role === 'assistant' ? (
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown 
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-base font-bold text-white mb-2 border-b border-zinc-700/50 pb-1">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-sm font-semibold text-white mb-2 mt-3">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-medium text-zinc-200 mb-1 mt-2">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-sm text-zinc-300 mb-2 leading-relaxed">
                      {children}
                    </p>
                  ),
                  strong: ({ children }) => (
                    <strong className="text-white font-semibold">
                      {children}
                    </strong>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside mb-2 space-y-0.5">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside mb-2 space-y-0.5">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-sm text-zinc-300">
                      {children}
                    </li>
                  ),
                  em: ({ children }) => (
                    <em className="text-zinc-300 italic">
                      {children}
                    </em>
                  ),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className="bg-zinc-800/50 text-zinc-200 px-1.5 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className="block bg-zinc-900/50 text-zinc-200 p-2 rounded text-xs font-mono overflow-x-auto">
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => (
                    <pre className="bg-zinc-900/50 rounded p-2 overflow-x-auto mb-2">
                      {children}
                    </pre>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-zinc-600 pl-3 my-2 text-zinc-400 italic">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{content}</p>
          )}
        </div>
      </div>
      
      {role === 'user' && (
        <Avatar className="size-8">
          <AvatarImage 
            src={avatarUrl || ''} 
            alt={userName || userEmail?.split('@')[0] || 'User'} 
          />
          <AvatarFallback>
            {userEmail ? userEmail.substring(0, 2).toUpperCase() : "UN"}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}