"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "ai/react";
import { Button } from "@v1/ui/button";
import { Input } from "@v1/ui/input";
import { ScrollArea } from "@v1/ui/scroll-area";
import { Spinner } from "@v1/ui/spinner";
import { Avatar, AvatarFallback } from "@v1/ui/avatar";
import { Badge } from "@v1/ui/badge";
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
        <div className="bg-background border rounded-lg shadow-sm">
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
            
            <div className="border-t p-4">
              <form onSubmit={handleFormSubmit} className="flex w-full gap-2">
                <Input
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Ask about crypto prices, market data, or anything else..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button 
                  type="submit" 
                  disabled={isLoading || !input.trim()}
                  size="icon"
                >
                  <IconPaperplane className="size-4" />
                </Button>
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
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Main Input */}
      <div className="relative">
        <form onSubmit={handleFormSubmit}>
          <div className="flex items-center gap-3 p-4 bg-background border rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-ring">
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about crypto prices, market trends, or anything else..."
              disabled={isLoading}
              className="flex-1 border-0 bg-transparent text-lg placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            
            <div className="flex items-center gap-2">        
              <Button 
                type="submit" 
                disabled={isLoading || !input.trim()}
                size="icon"
                className="h-8 w-8 rounded-full"
              >
                <IconPaperplane className="size-4" />
              </Button>
            </div>
          </div>
        </form>
        
        {(isLoading || isDataLoading) && (
          <div className="absolute top-full left-4 mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            <span>{isDataLoading ? 'Fetching live data...' : 'Thinking...'}</span>
          </div>
        )}
      </div>
      
      {/* Suggested Prompts */}
      <div className="space-y-4">
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
      </div>
      
      {/* Live Data Badge */}
      <div className="flex justify-center">
        <Badge variant="secondary" className="px-3 py-1">
          <IconChartLineUptrendXyaxis className="w-4 h-4 mr-1" />
          Live Crypto Data Available
        </Badge>
      </div>
      
      {error && (
        <p className="text-sm text-destructive text-center">
          Error: {error.message}
        </p>
      )}
    </div>
  );
}