"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "ai/react";
import { Button } from "@v1/ui/button";
import { Input } from "@v1/ui/input";
import { ScrollArea } from "@v1/ui/scroll-area";
import { Spinner } from "@v1/ui/spinner";
import { Avatar, AvatarFallback } from "@v1/ui/avatar";
import { 
  IconPaperplane, 
  IconPersonFill, 
  IconStarFill, 
  IconChartLineUptrendXyaxis,
  IconLightbulb,
  IconBrain,
} from "symbols-react";

interface SuggestedPrompt {
  label: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
}

const suggestedPrompts: SuggestedPrompt[] = [
  {
    label: "Market Analysis",
    prompt: "Show me the top 10 cryptocurrencies and their market performance",
    icon: IconChartLineUptrendXyaxis
  },
  {
    label: "Price Check",
    prompt: "What's the current price of Bitcoin and Ethereum?",
    icon: IconChartLineUptrendXyaxis
  },
  {
    label: "Portfolio",
    prompt: "Help me analyze my crypto portfolio performance",
    icon: IconChartLineUptrendXyaxis
  },
  {
    label: "Compare Coins",
    prompt: "Compare Bitcoin vs Ethereum performance this week",
    icon: IconChartLineUptrendXyaxis
  },
  {
    label: "News & Trends",
    prompt: "What are the latest trends in cryptocurrency markets?",
    icon: IconLightbulb
  },
  {
    label: "Technical Analysis",
    prompt: "Provide technical analysis for Solana",
    icon: IconBrain
  },
  {
    label: "Learn Crypto",
    prompt: "Explain DeFi and how it works",
    icon: IconChartLineUptrendXyaxis
  }
];

export function Chat() {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    setInput,
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

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

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt);
    if (detectDataQuery(prompt)) {
      setIsDataLoading(true);
    }
    // Use setTimeout to ensure input is set before submission
    setTimeout(() => {
      const form = document.querySelector('form');
      if (form) {
        form.requestSubmit();
      }
    }, 0);
  };

  if (showConversation) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="">
          <div className="h-[600px] flex flex-col">
            <div className="flex-1 overflow-hidden p-4">
              <ScrollArea className="h-full pr-4" ref={scrollAreaRef}>
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {message.role === 'assistant' && (
                        <Avatar className="size-8">
                          <AvatarFallback>
                            <IconStarFill className="size-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      
                      {message.role === 'user' && (
                        <Avatar className="size-8">
                          <AvatarFallback>
                            <IconPersonFill className="size-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                  
                  {(isLoading || isDataLoading) && (
                    <div className="flex gap-3 justify-start">
                      <Avatar className="size-8">
                        <AvatarFallback>
                          <IconStarFill className="size-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                        <Spinner />
                        <span className="text-sm text-muted-foreground">
                          {isDataLoading ? 'Fetching live data...' : 'Thinking...'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
            
            <div className="p-4">
              <form onSubmit={handleFormSubmit}>
                <div className="relative rounded-[20px] bg-zinc-900 overflow-hidden p-1
                               shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
                               dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
                  
                  {/* Background Pattern - FIRST (behind everything) */}
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
                      onChange={handleInputChange}
                      placeholder="Ask about crypto prices, market data, or anything else..."
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
              
              {error && (
                <p className="text-sm text-destructive mt-2">
                  Error: {error.message}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Main Input with Bottom Nav Styling */}
      <div className="relative border border-white/5 p-2 rounded-[30px]">
        <form onSubmit={handleFormSubmit}>
          <div className="relative rounded-[20px] bg-zinc-900 overflow-hidden p-1
                         shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
                         dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]">
            
            {/* Background Pattern - FIRST (behind everything) */}
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
                onChange={handleInputChange}
                placeholder="Ask about crypto prices, market trends, or anything else..."
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
      </div>
      
      {/* Suggested Prompts */}
      {/* <div className="space-y-4">
        <div className="flex flex-wrap gap-3 justify-center">
          {suggestedPrompts.slice(0, 5).map((prompt) => (
            <Button
              key={prompt.label}
              variant="outline"
              onClick={() => handleSuggestedPrompt(prompt.prompt)}
              disabled={isLoading}
              className="h-auto p-3 rounded-xl border-2 hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="flex items-center gap-2">
                <prompt.icon className="size-4" />
                <span className="text-sm font-medium">{prompt.label}</span>
              </div>
            </Button>
          ))}
        </div>
        
        <div className="flex flex-wrap gap-3 justify-center">
          {suggestedPrompts.slice(5).map((prompt) => (
            <Button
              key={prompt.label}
              variant="outline"
              onClick={() => handleSuggestedPrompt(prompt.prompt)}
              disabled={isLoading}
              className="h-auto p-3 rounded-xl border-2 hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="flex items-center gap-2">
                <prompt.icon className="size-4" />
                <span className="text-sm font-medium">{prompt.label}</span>
              </div>
            </Button>
          ))}
        </div>
      </div> */}
    
      {error && (
        <p className="text-sm text-destructive text-center mt-4">
          Error: {error.message}
        </p>
      )}
    </div>
  );
}