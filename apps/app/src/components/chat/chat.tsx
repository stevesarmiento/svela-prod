"use client";

import { useState, useEffect } from "react";
import { useChat } from "ai/react";
import { useAuth } from "@v1/convex/hooks";
import { ChatInput } from "./chat-input";
import { ConversationView } from "./conversation-view";

export function Chat() {
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
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
    onFinish: () => {
      setIsDataLoading(false);
    },
  });

  // Show conversation view when there are messages
  useEffect(() => {
    setShowConversation(messages.length > 0);
  }, [messages.length]);

  // Detect if user is asking for data
  const detectDataQuery = (message: string): boolean => {
    const dataKeywords = [
      'price', 'bitcoin', 'ethereum', 'btc', 'eth', 'market', 'crypto',
      'coin', 'trading', 'value', 'worth', 'cost', 'analysis', 'trend'
    ];
    return dataKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      // Check if this might require data fetching
      if (detectDataQuery(input)) {
        setIsDataLoading(true);
      }
      handleSubmit(e);
    }
  };

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