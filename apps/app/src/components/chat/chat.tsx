"use client";

import { useState, useRef } from "react";
import { useChat } from "ai/react";
import { useAuth } from "@v1/convex/hooks";
import { ChatInput } from "./chat-input";
import { ChatMessageList } from "./chat-message-list";
import { motion } from "framer-motion";

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

  const detectDataQuery = async (message: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/parse-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message,
          systemPrompt: `You are a cryptocurrency query parser. Determine if this user query is asking for cryptocurrency data, prices, or market information.

Respond with JSON only:
{
  "isDataQuery": true/false,
  "intent": "brief description"
}

Examples:
"How is Solana doing today?" → {"isDataQuery": true, "intent": "asking for Solana price/performance"}
"What's the weather like?" → {"isDataQuery": false, "intent": "asking about weather"}
"Tell me about DeFi trends" → {"isDataQuery": true, "intent": "asking about cryptocurrency trends"}
"How are you?" → {"isDataQuery": false, "intent": "general greeting"}`
        })
      });
      
      const result = await response.json();
      return result.isDataQuery || false;
    } catch (error) {
      console.error('Failed to detect data query:', error);
      // Fallback to basic keyword detection
      const dataKeywords = ['price', 'bitcoin', 'ethereum', 'crypto', 'coin', 'market'];
      return dataKeywords.some(keyword => message.toLowerCase().includes(keyword));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      const isDataQuery = await detectDataQuery(input);
      
      if (isDataQuery) {
        console.log('Detected data query, setting lastDataQuery');
        setIsDataLoading(true);
        const queryId = Date.now().toString();
        lastDataQueryRef.current = queryId;
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

  return (
    <div className="h-full w-full flex flex-col relative">
      {/* Message list area - takes up space above input */}
      <motion.div 
        className="flex-1 overflow-hidden"
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="h-full max-w-4xl mx-auto">
          {messages.length > 0 && (
            <motion.div 
              className="h-full pb-4" // pb-4 for some spacing from input
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <ChatMessageList 
                messages={messages}
                isLoading={isLoading}
                isDataLoading={isDataLoading}
                userImage={user?.avatarUrl}
                userName={user?.fullName || user?.email?.split('@')[0]}
                messageComponents={messageComponents}
              />
            </motion.div>
          )}
        </div>
      </motion.div>
      
      {/* Input fixed at bottom of container */}
      <motion.div 
        className="shrink-0 p-4 bg-background/95 backdrop-blur-xs border-t"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="max-w-4xl mx-auto">
          <ChatInput
            input={input}
            isLoading={isLoading}
            isDataLoading={isDataLoading}
            onInputChange={handleInputChange}
            onSubmit={handleFormSubmit}
            error={error}
          />
        </div>
      </motion.div>
    </div>
  );
}