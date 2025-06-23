"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@v1/ui/avatar";
import Image from "next/image";
import { useAuth } from "@v1/convex/hooks";
import { PriceCard } from "./price-card";

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
      )}
      
      <div className={`max-w-[80%] space-y-3 ${role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`rounded-lg px-4 py-2 ${
            role === 'user'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        </div>
        
        {/* Render component if it's an assistant message and we have component data */}
        {role === 'assistant' && componentData?.type === 'price_card' && (
          <PriceCard {...componentData.data} />
        )}
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