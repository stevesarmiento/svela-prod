'use client'

import React, { useState, useRef } from 'react'
import { useChat } from 'ai/react'
import { useAuth } from '@v1/convex/hooks'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Button } from '@v1/ui/button'
import { ScrollArea } from '@v1/ui/scroll-area'
import { IconXmarkCircleFill } from 'symbols-react'
import { ChatMessageList } from './chat-message-list'
import type { Message } from 'ai'

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

interface ComponentData {
  type: 'price_card';
  data: PriceCardData;
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isDataLoading: boolean;
  messageComponents: Record<string, ComponentData>;
}

// Shared chat state manager
class ChatStateManager {
  private static instance: ChatStateManager;
  private chatState: ChatState | null = null;
  private listeners: Set<(state: ChatState | null) => void> = new Set();

  static getInstance(): ChatStateManager {
    if (!ChatStateManager.instance) {
      ChatStateManager.instance = new ChatStateManager();
    }
    return ChatStateManager.instance;
  }

  setChatState(state: ChatState) {
    this.chatState = state;
    this.listeners.forEach(listener => listener(state));
  }

  getChatState() {
    return this.chatState;
  }

  subscribe(listener: (state: ChatState | null) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

// Custom chat toast component - only shows conversation output
function ChatToastContent({ toastId, onClose }: { toastId: string | number; onClose?: () => void }) {
  const [chatState, setChatState] = useState<ChatState | null>(null);
  const { user } = useAuth();
  const chatManager = ChatStateManager.getInstance();

  React.useEffect(() => {
    // Get initial state
    setChatState(chatManager.getChatState());
    
    // Subscribe to updates
    const unsubscribe = chatManager.subscribe((state: ChatState | null) => {
      setChatState(state);
    });

    return unsubscribe;
  }, [chatManager]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      toast.dismiss(toastId);
    }
  };

  if (!chatState) {
    return (
      <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="flex flex-col h-[400px]">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h3 className="text-sm font-medium text-white">Chat</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-6 w-6 text-zinc-400 hover:text-white"
            >
              <IconXmarkCircleFill className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
            Start a conversation using the chat input
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full translate-x-[-60px] bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mx-auto">
      <div className="flex flex-col h-[500px]">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-white">Chat</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-6 w-6 text-zinc-400 hover:text-white"
          >
            <IconXmarkCircleFill className="h-4 w-4" />
          </Button>
        </div>

        {/* Chat Messages - Only Output */}
        <ScrollArea className="flex-1">
          <ChatMessageList
            messages={chatState.messages || []}
            isLoading={chatState.isLoading || false}
            isDataLoading={chatState.isDataLoading || false}
            userImage={user?.avatarUrl}
            userName={user?.fullName || user?.email?.split('@')[0]}
            messageComponents={chatState.messageComponents || {}}
          />
        </ScrollArea>
      </div>
    </div>
  );
}

// Hook to manage chat toast with shared state
export function useChatToast() {
  const toastIdRef = useRef<string | number | null>(null);

  const showChatToast = () => {
    // If a chat toast is already open, don't create a new one
    if (toastIdRef.current) {
      return;
    }

    toast.custom((t) => {
      // Store the toast ID when created
      toastIdRef.current = t;
      
      return (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 280,
            damping: 18,
            mass: 0.3,
          }}
          className="w-[460px] mx-auto"
        >
          <ChatToastContent 
            toastId={t} 
            onClose={() => {
              // Clear the ref when toast is closed
              toastIdRef.current = null;
              toast.dismiss(t);
            }} 
          />
        </motion.div>
      );
    }, {
      duration: Infinity,
      position: 'top-center',
    });
  };

  const closeChatToast = () => {
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
  };

  return { showChatToast, closeChatToast };
}

// Hook to manage chat state and share it with toast
export function useChatState() {
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [messageComponents, setMessageComponents] = useState<Record<string, ComponentData>>({});
  const [isStopped, setIsStopped] = useState(false);
  const lastDataQueryRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatManager = ChatStateManager.getInstance();

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    stop,
  } = useChat({
    api: '/api/chat',
    onResponse: async (response) => {
      const componentDataHeader = response.headers.get('X-Component-Data');
      
      if (componentDataHeader && lastDataQueryRef.current) {
        try {
          const parsedComponentData = JSON.parse(componentDataHeader);
          setMessageComponents(prev => {
            const newComponents = {
              ...prev,
              [`temp_${lastDataQueryRef.current}`]: parsedComponentData
            };
            
            // Defer state update to avoid render cycle conflicts
            setTimeout(() => {
              chatManager.setChatState({
                messages,
                isLoading,
                isDataLoading,
                messageComponents: newComponents,
              });
            }, 0);
            
            return newComponents;
          });
        } catch (err) {
          console.error('Failed to parse component data:', err);
        }
      }
    },
    onFinish: (message) => {
      setIsDataLoading(false);
      setIsStopped(false);
      abortControllerRef.current = null;
      
      // Move component data from temp key to actual message ID
      if (message.role === 'assistant' && lastDataQueryRef.current) {
        const tempKey = `temp_${lastDataQueryRef.current}`;
        setMessageComponents(prev => {
          const componentData = prev[tempKey];
          if (componentData) {
            const newComponents = { ...prev };
            delete newComponents[tempKey];
            newComponents[message.id] = componentData;
            
            // Defer state update to avoid render cycle conflicts
            setTimeout(() => {
              chatManager.setChatState({
                messages: [...messages, message],
                isLoading: false,
                isDataLoading: false,
                messageComponents: newComponents,
              });
            }, 0);
            
            return newComponents;
          }
          return prev;
        });
        lastDataQueryRef.current = null;
      }
    },
  });

  // Update shared state whenever local state changes (deferred)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      chatManager.setChatState({
        messages,
        isLoading,
        isDataLoading,
        messageComponents,
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [messages, isLoading, isDataLoading, messageComponents, chatManager]);

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
      const dataKeywords = ['price', 'bitcoin', 'ethereum', 'crypto', 'coin', 'market'];
      return dataKeywords.some(keyword => message.toLowerCase().includes(keyword));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      setIsStopped(false);
      
      abortControllerRef.current = new AbortController();
      
      const isDataQuery = await detectDataQuery(input);
      
      if (isDataQuery) {
        setIsDataLoading(true);
        const queryId = Date.now().toString();
        lastDataQueryRef.current = queryId;
      } else {
        lastDataQueryRef.current = null;
      }
      handleSubmit(e);
    }
  };

  const handleStop = () => {
    stop();
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setIsDataLoading(false);
    setIsStopped(true);
    
    setTimeout(() => {
      setIsStopped(false);
    }, 3000);
  };

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit: handleFormSubmit,
    isLoading,
    isDataLoading,
    error,
    stop: handleStop,
    isStopped,
  };
}

// Legacy component for backward compatibility
export function ChatToast() {
  // Remove the automatic toast showing logic
  // The toast should only appear when explicitly called via useChatToast
  return null;
} 