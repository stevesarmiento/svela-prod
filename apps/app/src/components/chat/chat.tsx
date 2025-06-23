"use client";

import { useState, useEffect, useRef } from "react";
import { useChat } from "ai/react";
import { useAuth } from "@v1/convex/hooks";
import { ChatInput } from "./chat-input";
import { ConversationView } from "./conversation-view";

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

export function Chat() {
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  const [messageComponents, setMessageComponents] = useState<Record<string, ComponentData>>({});
  const lastDataQueryRef = useRef<string | null>(null);
  const { user } = useAuth();
  
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
  } = useChat({
    api: '/api/chat',
    onResponse: async (response) => {
      console.log('Response received, checking headers...');
      console.log('Current lastDataQuery:', lastDataQueryRef.current);
      const componentDataHeader = response.headers.get('X-Component-Data');
      console.log('Component data header:', componentDataHeader);
      
      if (componentDataHeader && lastDataQueryRef.current) {
        console.log('Processing component data for query:', lastDataQueryRef.current);
        try {
          const parsedComponentData = JSON.parse(componentDataHeader);
          console.log('Parsed component data:', parsedComponentData);
          // Store component data with a temporary key
          setMessageComponents(prev => ({
            ...prev,
            [`temp_${lastDataQueryRef.current}`]: parsedComponentData
          }));
        } catch (err) {
          console.error('Failed to parse component data:', err);
        }
      } else {
        console.log('Skipping component data - missing header or lastDataQuery');
      }
    },
    onFinish: (message) => {
      setIsDataLoading(false);
      
      // Move component data from temp key to actual message ID
      if (message.role === 'assistant' && lastDataQueryRef.current) {
        const tempKey = `temp_${lastDataQueryRef.current}`;
        setMessageComponents(prev => {
          const componentData = prev[tempKey];
          if (componentData) {
            const newComponents = { ...prev };
            delete newComponents[tempKey]; // Remove temp entry
            newComponents[message.id] = componentData; // Add to actual message ID
            return newComponents;
          }
          return prev;
        });
        lastDataQueryRef.current = null; // Reset the ref
      }
    },
  });

  // Show conversation view when there are messages
  useEffect(() => {
    setShowConversation(messages.length > 0);
  }, [messages.length]);

  // Detect if user is asking for data
  const detectDataQuery = (message: string): boolean => {
    const dataKeywords = [
      'price', 'bitcoin', 'ethereum','solana', 'btc', 'eth', 'market', 'crypto',
      'coin', 'trading', 'value', 'worth', 'cost', 'analysis', 'trend'
    ];
    return dataKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      if (detectDataQuery(input)) {
        console.log('Detected data query, setting lastDataQuery');
        setIsDataLoading(true);
        const queryId = Date.now().toString();
        lastDataQueryRef.current = queryId; // Use ref instead of state
        console.log('Set lastDataQuery to:', queryId);
      } else {
        console.log('Not a data query, clearing lastDataQuery');
        lastDataQueryRef.current = null;
      }
      handleSubmit(e);
    }
  };

  // Add some debugging
  console.log('messageComponents:', messageComponents);
  console.log('messages:', messages.map(m => ({ id: m.id, role: m.role, content: m.content.slice(0, 50) })));

  if (showConversation) {
    return (
      <ConversationView
        messages={messages}
        input={input}
        isLoading={isLoading}
        isDataLoading={isDataLoading}
        error={error || null}
        onInputChange={handleInputChange}
        onSubmit={handleFormSubmit}
        userImage={user?.avatarUrl}
        userName={user?.fullName || user?.email?.split('@')[0]}
        userEmail={user?.email}
        messageComponents={messageComponents}
      />
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative border border-white/5 p-2 rounded-[30px]">
        <ChatInput
          input={input}
          isLoading={isLoading}
          isDataLoading={isDataLoading}
          onInputChange={handleInputChange}
          onSubmit={handleFormSubmit}
          error={error}
        />
      </div>
    </div>
  );
}