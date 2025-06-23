"use client";

import { Button } from "@v1/ui/button";
import { Input } from "@v1/ui/input";
import { Spinner } from "@v1/ui/spinner";
import { IconPaperplane } from "symbols-react";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  isDataLoading: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  placeholder?: string;
  error?: Error | null;
}

export function ChatInput({
  input,
  isLoading,
  isDataLoading,
  onInputChange,
  onSubmit,
  placeholder = "Ask about crypto prices, market trends, or anything else...",
  error,
}: ChatInputProps) {
  return (
    <div className="relative">
      <form onSubmit={onSubmit}>
        <div className="relative rounded-[20px] bg-zinc-900 overflow-hidden p-1
                       shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
                       dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
          
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5 z-0"
            style={{
              backgroundImage: `
                radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
                radial-gradient(circle at 75% 75%, white 1px, transparent 1px)
              `,
              backgroundSize: "24px 24px",
            }}
          />
          
          <div className="relative z-10 flex items-center gap-3 p-3">
            <Input
              value={input}
              onChange={onInputChange}
              placeholder={placeholder}
              disabled={isLoading}
              className="flex-1 border-0 bg-transparent text-lg text-white placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            
            <Button 
              type="submit" 
              disabled={isLoading || !input.trim()}
              size="icon"
              className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200"
            >
              <IconPaperplane className="size-4 fill-white" />
            </Button>
          </div>
        </div>
      </form>
      
      {(isLoading || isDataLoading) && (
        <div className="absolute top-full left-4 mt-2 flex items-center gap-2 text-sm text-white/70">
          <Spinner />
          <span>{isDataLoading ? 'Fetching live data...' : 'Thinking...'}</span>
        </div>
      )}
      
      {error && (
        <p className="text-sm text-destructive mt-2">
          Error: {error.message}
        </p>
      )}
    </div>
  );
}