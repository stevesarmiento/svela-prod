'use client'

import React, { useState, useRef, useEffect, useTransition, useDeferredValue } from 'react'
import { useChat } from 'ai/react'
import { useAuth } from '@v1/convex/hooks'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { autoCleanupSessionMemories, bulkCleanupMemories } from '@/lib/client-memory-utils'
import { Button } from '@v1/ui/button'
import { ScrollArea } from '@v1/ui/scroll-area'
import { IconXmarkCircleFill } from 'symbols-react'
import { ChatMessageList } from './chat-message-list'
import GradualBlur from '@v1/ui/progressive-blur'
import type { Message } from 'ai'

// Chat-specific interfaces using CoinGecko format
interface PriceCardData {
  coingeckoId: string;
  name: string;
  symbol: string;
  currentPrice: number;
  priceChangePercentage24h: number;
  marketCap?: number;
  totalVolume?: number;
  marketCapRank?: number;
  image?: string;
  historical?: {
    data?: {
      prices?: Array<[number, number]>;
    };
  };
}

interface ComparisonChartData {
  coins: Array<{
    coingeckoId: string;
    name: string;
    symbol: string;
    currentPrice: number;
    priceChangePercentage24h: number;
    marketCap: number;
    totalVolume: number;
    marketCapRank: number;
    image?: string;
    historical?: {
      timeframe: string;
      prices: Array<{
        timestamp: number;
        price: number;
      }>;
      volumes?: Array<{
        timestamp: number;
        volume: number;
      }>;
    };
  }>;
  timeframe: string;
  chartType?: string;
}

interface ComponentData {
  type: 'price_card' | 'comparison_chart';
  data: PriceCardData | ComparisonChartData;
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
  private inputCloseCallback: (() => void) | null = null;

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

  setInputCloseCallback(callback: () => void) {
    this.inputCloseCallback = callback;
  }

  closeInput() {
    if (this.inputCloseCallback) {
      this.inputCloseCallback();
    }
  }
}

// Export the ChatStateManager for use in other components
export { ChatStateManager };

// Enhanced indicator component (always enhanced now)
function EnhancedIndicator() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-blue-400">Enhanced</span>
      <span className="text-xs text-blue-400">🚀</span>
    </div>
  );
}

// React 19: Optimized chat toast component with concurrent features
function ChatToastContent({ toastId, onClose }: { toastId: string | number; onClose?: () => void }) {
  const [chatState, setChatState] = useState<ChatState | null>(null);
  const { user } = useAuth();
  const chatManager = ChatStateManager.getInstance();
  const [, startTransition] = useTransition();
  
  // React 19: Defer expensive chat state updates
  const deferredChatState = useDeferredValue(chatState);

  useEffect(() => {
    // React 19: Get initial state with transition
    startTransition(() => {
      setChatState(chatManager.getChatState());
    });
    
    // React 19: Subscribe to updates with batched state changes
    const unsubscribe = chatManager.subscribe((state: ChatState | null) => {
      startTransition(() => {
        setChatState(state);
      });
    });

    return unsubscribe;
  }, [chatManager, startTransition]);

  // Auto-cleanup session memories if enabled
  const autoCleanupSession = React.useCallback(async () => {
    if (!user?.id) return;
    await autoCleanupSessionMemories(user.id);
  }, [user?.id]);

  const handleClose = React.useCallback(async () => {
    // Note: Bulk archiving is handled by the toast's onDismiss callback
    // Auto-cleanup session if enabled
    await autoCleanupSession();
    
    // Close the input when toast is dismissed
    const chatManager = ChatStateManager.getInstance();
    chatManager.closeInput();
    
    if (onClose) {
      onClose();
    } else {
      toast.dismiss(toastId);
    }
  }, [autoCleanupSession, onClose, toastId]);

  // Handle escape key to close toast
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleClose]);

  if (!deferredChatState) {
    return (
      <div className="w-[540px] mx-auto bg-zinc-50/80 dark:bg-zinc-900/90 backdrop-blur-[100px] border border-white dark:border-zinc-800/50 rounded-[20px] overflow-hidden shadow-xl dark:shadow-black/50 shadow-black/10 active:cursor-grabbing cursor-grab">
        <div className="flex flex-col h-[calc(100vh-200px)]">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-800">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Chat</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-6 w-6 rounded-xl text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
            >
              <IconXmarkCircleFill className="h-4 w-4 fill-gray-500 dark:fill-white/50" />
            </Button>
          </div>
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-zinc-400 text-sm">
            Start a conversation using the chat input
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full -translate-x-1/3 bg-zinc-50/80 dark:bg-zinc-900/90 backdrop-blur-[100px] border border-white dark:border-zinc-800/50 rounded-[20px] overflow-hidden mx-auto shadow-xl dark:shadow-black/50 shadow-black/10 active:cursor-grabbing cursor-grab">
      <div className="flex flex-col h-[calc(100vh-300px)]">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-800/50">
          <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Chat</h3>
            <EnhancedIndicator />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-6 w-6 rounded-xl text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
          >
            <IconXmarkCircleFill className="h-4 w-4 fill-gray-500 dark:fill-white/50" />
          </Button>
        </div>

        {/* Chat Messages - optimized scroll area */}
        <ScrollArea className="flex-1">
          <ChatMessageList
            messages={deferredChatState.messages || []}
            isLoading={deferredChatState.isLoading || false}
            isDataLoading={deferredChatState.isDataLoading || false}
            userImage={user?.avatarUrl}
            userName={user?.fullName || user?.email?.split('@')[0]}
            messageComponents={deferredChatState.messageComponents || {}}
          />
        </ScrollArea>
      </div>
    </div>
  );
}

// Hook to manage chat toast with shared state
// Test functions removed - archiving moved to background jobs for performance

export function useChatToast() {
  const toastIdRef = useRef<string | number | null>(null);
  const { user } = useAuth();

  // Bulk delete chat memories when dismissing chat
  const bulkDeleteChatMemories = React.useCallback(async () => {
    if (!user?.id) return;
    
    try {
      
      // Delete all chat memories from current session
      const cleanupResult = await bulkCleanupMemories(user.id, {
        metadataFilter: {
          category: 'chat',
          source: 'chat'
        }
      });
      
      if (!cleanupResult.success) {
        console.warn('⚠️ Failed to delete chat memories');
      }
    } catch (error) {
      console.error('❌ Failed to bulk delete memories:', error);
    }
  }, [user?.id]);

  const showChatToast = () => {
    if (toastIdRef.current) {
      return;
    }

    toast.custom((t) => {
      toastIdRef.current = t;
      
      return (
        <div className="relative w-screen h-[90%] flex pt-24 z-[9999]">
          {/* Progressive blur at the top of the page */}
          <GradualBlur
            target="page"
            position="top"
            height="50rem"
            width="100vw"
            strength={3}
            divCount={8}
            curve="bezier"
            exponential={true}
            opacity={1}
            zIndex={0}
            style={{
              left: '50%',
              transform: 'translateX(-34%)',
              right: 'auto'
            }}
          />
          
          {/* Chat content with original positioning */}
          <motion.div
            initial={{ y: -20, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -20, scale: 0.96 }}
            transition={{
              type: "tween",
              duration: 0.12,
              ease: [0.4, 0, 0.2, 1], // Custom easing for smoothness
            }}
            className="w-[60%] relative z-[9999]"
            style={{ willChange: "transform" }}
          >
            <ChatToastContent 
              toastId={t} 
              onClose={() => {
                toastIdRef.current = null;
                toast.dismiss(t);
              }} 
            />
          </motion.div>
        </div>
      );
    }, {
      duration: Infinity,
      position: 'top-center',
      onDismiss: async () => {
        // Immediate UI updates for responsiveness
        const chatManager = ChatStateManager.getInstance();
        chatManager.closeInput();
        toastIdRef.current = null;
        
        // React 19: Heavy cleanup operations (async functions can't use startTransition directly)
        if (user?.id) {
          try {
            await bulkDeleteChatMemories();
            await autoCleanupSessionMemories(user.id);
          } catch (error) {
            console.error('Failed to cleanup on dismiss:', error);
          }
        }
      }
    });
  };

  const closeChatToast = async () => {
    if (toastIdRef.current) {
      // Immediate UI updates for responsiveness
      const chatManager = ChatStateManager.getInstance();
      chatManager.closeInput();
      
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
      
      // Heavy cleanup operations in background
      if (user?.id) {
        try {
          await bulkDeleteChatMemories();
          await autoCleanupSessionMemories(user.id);
        } catch (error) {
          console.error('Failed to cleanup on close:', error);
        }
      }
    }
  };

  return { showChatToast, closeChatToast };
}

// React 19: Optimized hook to manage chat state with concurrent features
export function useChatState() {
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [messageComponents, setMessageComponents] = useState<Record<string, ComponentData>>({});
  const [isStopped, setIsStopped] = useState(false);
  const lastDataQueryRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatManager = ChatStateManager.getInstance();
  const { user } = useAuth();
  
  // React 19: Add transition for heavy state updates
  const [isPending, startTransition] = useTransition();
  
  // React 19: Defer expensive message components for better performance
  const deferredMessageComponents = useDeferredValue(messageComponents);

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
    body: {
      userId: user?.id || null, // 🚀 Add userId for memory functionality
    },
    onResponse: async (response) => {
      // Check if this is an enhanced response
      const isEnhancedResponse = response.headers.get('X-Enhanced-Chat') === 'true';
      
      if (isEnhancedResponse) {
        // Handle enhanced response from headers
        const componentDataHeader = response.headers.get('X-Component-Data');
        
        if (componentDataHeader && lastDataQueryRef.current) {
          try {
            const componentData = JSON.parse(componentDataHeader);
            
            setMessageComponents(prev => {
              const newComponents = {
                ...prev,
                [`temp_${lastDataQueryRef.current}`]: componentData
              };
              
              // React 19: Use startTransition instead of setTimeout for better batching
              startTransition(() => {
                chatManager.setChatState({
                  messages,
                  isLoading,
                  isDataLoading,
                  messageComponents: newComponents,
                });
              });
              
              return newComponents;
            });
          } catch (err) {
            console.error('Failed to parse enhanced component data:', err);
          }
        }
      } else {
        // Handle basic response format (legacy)
      const componentDataHeader = response.headers.get('X-Component-Data');
      
      if (componentDataHeader && lastDataQueryRef.current) {
        try {
          const parsedComponentData = JSON.parse(componentDataHeader);
          setMessageComponents(prev => {
            const newComponents = {
              ...prev,
              [`temp_${lastDataQueryRef.current}`]: parsedComponentData
            };
            
            // React 19: Use startTransition instead of setTimeout for better batching
            startTransition(() => {
              chatManager.setChatState({
                messages,
                isLoading,
                isDataLoading,
                messageComponents: newComponents,
              });
            });
            
            return newComponents;
          });
        } catch (err) {
          console.error('Failed to parse component data:', err);
          }
        }
      }
    },
    onFinish: async (message) => {
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
            return newComponents;
          }
          return prev;
        });
        lastDataQueryRef.current = null;
      }
    },
  });

  // React 19: Update shared state with concurrent features
  useEffect(() => {
    startTransition(() => {
      chatManager.setChatState({
        messages,
        isLoading,
        isDataLoading,
        messageComponents: deferredMessageComponents, // Use deferred value for better performance
      });
    });
  }, [messages, isLoading, isDataLoading, deferredMessageComponents, chatManager, startTransition]);

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
    
    // React 19: Use startTransition for delayed state reset
    startTransition(() => {
      setTimeout(() => {
        setIsStopped(false);
      }, 3000);
    });
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
    isPending, // React 19: Expose pending state for UI feedback
  };
}

// Legacy component for backward compatibility - renders nothing
export function ChatToast() {
  return null;
} 