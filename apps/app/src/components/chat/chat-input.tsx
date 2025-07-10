"use client";

import React from 'react';
import { Button } from '@v1/ui/button';
import { Input } from '@v1/ui/input';
import { IconPaperplaneFill, IconSquareFill } from 'symbols-react';

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  isDataLoading: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  error: Error | null;
}

export function ChatInput({
  input,
  isLoading,
  isDataLoading,
  onInputChange,
  onSubmit,
  error
}: ChatInputProps) {
  const isRequestActive = isLoading || isDataLoading;

  const getButtonContent = () => {
    if (isRequestActive) {
      return <IconSquareFill className="w-5 h-5 fill-red-400 group-hover:fill-red-300" />;
    }
    return <IconPaperplaneFill className="w-5 h-5 fill-white/50 group-hover:fill-white" />;
  };

  const getStatusMessage = () => {
    if (error) {
      return `Error: ${error.message}`;
    }
    if (isDataLoading) {
      return "Fetching live data...";
    }
    if (isLoading) {
      return "Thinking...";
    }
    return null;
  };

  return (
    <div className="relative">
      <form onSubmit={onSubmit} className="flex items-center gap-3">
        <Input
          value={input}
          onChange={onInputChange}
          placeholder="Ask about token prices, market trends, or anything else..."
          disabled={isRequestActive}
          className="flex-1 bg-transparent border-white/10 text-white placeholder:text-white/50 focus-visible:ring-white/20"
        />
        
        <Button 
          type="submit" 
          disabled={!isRequestActive && !input.trim()}
          size="icon"
          variant="ghost"
          className={`group transition-all duration-200 ${
            isRequestActive 
              ? 'bg-red-500/20 hover:bg-red-500/30' 
              : 'bg-white/5 hover:bg-white/10'
          }`}
          title={isRequestActive ? "Stop request" : "Send message"}
        >
          {getButtonContent()}
        </Button>
      </form>
      
      {getStatusMessage() && (
        <div className={`absolute top-full left-0 mt-2 flex items-center gap-2 text-sm ${
          error ? 'text-red-400' : 'text-white/70'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            error ? 'bg-red-400' : 'bg-blue-400 animate-pulse'
          }`} />
          <span>{getStatusMessage()}</span>
        </div>
      )}
    </div>
  );
} 