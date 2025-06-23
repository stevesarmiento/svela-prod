"use client";

import { ChatMessageList } from "./chat-message-list";
import { ChatInput } from "./chat-input";
import type { Message } from "ai";

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
        />
        
        <div className="p-4">
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