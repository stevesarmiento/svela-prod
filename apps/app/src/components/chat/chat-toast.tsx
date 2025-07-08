'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useChat } from 'ai/react'
import { useAuth } from '@v1/convex/hooks'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { autoCleanupSessionMemories } from '@/lib/client-memory-utils'
import { Button } from '@v1/ui/button'
import { ScrollArea } from '@v1/ui/scroll-area'
import { ProgressiveBlur } from '@v1/ui/progressive-blur'
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

interface ComparisonChartData {
  coins: Array<{
    id: number;
    name: string;
    symbol: string;
    price: number;
    change24h: number;
    marketCap: number;
    volume24h: number;
    rank: number;
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

// Custom chat toast component - only shows conversation output
function ChatToastContent({ toastId, onClose }: { toastId: string | number; onClose?: () => void }) {
  const [chatState, setChatState] = useState<ChatState | null>(null);
  const { user } = useAuth();
  const chatManager = ChatStateManager.getInstance();

  useEffect(() => {
    // Get initial state
    setChatState(chatManager.getChatState());
    
    // Subscribe to updates
    const unsubscribe = chatManager.subscribe((state: ChatState | null) => {
      setChatState(state);
    });

    return unsubscribe;
  }, [chatManager]);

  // Auto-cleanup session memories if enabled
  const autoCleanupSession = React.useCallback(async () => {
    if (!user?.id) return;
    await autoCleanupSessionMemories(user.id);
  }, [user?.id]);

  const handleClose = React.useCallback(async () => {
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

  if (!chatState) {
    return (
      <div className="w-[540px] mx-auto bg-zinc-900/90 backdrop-blur-[100px] border border-zinc-800/50 rounded-[20px] overflow-hidden shadow-xl shadow-black/50 active:cursor-grabbing cursor-grab">
        <div className="flex flex-col h-[calc(100vh-200px)]">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h3 className="text-sm font-medium text-white">Chat</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-6 w-6 rounded-xl text-zinc-400 hover:text-white"
            >
              <IconXmarkCircleFill className="h-4 w-4 fill-white/50" />
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
    <div className="w-full -translate-x-1/3 bg-zinc-900/90 backdrop-blur-[100px] border border-zinc-800/50 rounded-[20px] overflow-hidden mx-auto shadow-xl shadow-black/50 active:cursor-grabbing cursor-grab">
      <div className="flex flex-col h-[calc(100vh-300px)]">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800/50">
          <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-white">Chat</h3>
            <EnhancedIndicator />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-6 w-6 rounded-xl text-zinc-400 hover:text-white"
          >
            <IconXmarkCircleFill className="h-4 w-4 fill-white/50" />
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
  const { user } = useAuth();

  const showChatToast = () => {
    if (toastIdRef.current) {
      return;
    }

    toast.custom((t) => {
      toastIdRef.current = t;
      
      return (
        <div className="relative w-screen h-[90%] flex pt-24">
          {/* Progressive Blur Background - Full viewport */}
          <ProgressiveBlur 
            direction="top"
            blurLayers={12}
            blurIntensity={1.3}
            className="absolute inset-0 -z-10 translate-x-[-50%] h-[90%]"
          />
          
          {/* Toast Content */}
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
            className="w-[60%] relative z-10"
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
        // Auto-cleanup session if enabled
        if (user?.id) {
          await autoCleanupSessionMemories(user.id);
        }
        
        // Clear ref and close input when toast is dismissed by any means (swipe, etc.)
        const chatManager = ChatStateManager.getInstance();
        chatManager.closeInput();
        toastIdRef.current = null;
      }
    });
  };

  const closeChatToast = async () => {
    if (toastIdRef.current) {
      // Auto-cleanup session if enabled
      if (user?.id) {
        await autoCleanupSessionMemories(user.id);
      }
      
      // Close the input when toast is dismissed programmatically
      const chatManager = ChatStateManager.getInstance();
      chatManager.closeInput();
      
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
  const { user } = useAuth();

  console.log('🚀 Always using enhanced chat mode');

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
        console.log('📊 Enhanced response received');
        
        // Handle enhanced response from headers
        const componentDataHeader = response.headers.get('X-Component-Data');
        const enhancedMetadataHeader = response.headers.get('X-Enhanced-Metadata');
        
        if (componentDataHeader && lastDataQueryRef.current) {
          try {
            const componentData = JSON.parse(componentDataHeader);
            console.log('Enhanced component data:', componentData);
            
            setMessageComponents(prev => {
              const newComponents = {
                ...prev,
                [`temp_${lastDataQueryRef.current}`]: componentData
              };
              
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
            console.error('Failed to parse enhanced component data:', err);
          }
        }
        
        // Log enhanced metadata for debugging
        if (enhancedMetadataHeader) {
          try {
            const enhancedMetadata = JSON.parse(enhancedMetadataHeader);
            console.log('Enhanced metadata:', enhancedMetadata);
          } catch (err) {
            console.error('Failed to parse enhanced metadata:', err);
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
      }
    },
    onFinish: (message) => {
      console.log('🏁 Chat message finished:', message.role, message.id);
      setIsDataLoading(false);
      setIsStopped(false);
      abortControllerRef.current = null;
      
      // Move component data from temp key to actual message ID
      if (message.role === 'assistant' && lastDataQueryRef.current) {
        const tempKey = `temp_${lastDataQueryRef.current}`;
        console.log('🔄 Moving component data from temp key to message ID:', tempKey, '->', message.id);
        
        setMessageComponents(prev => {
          const componentData = prev[tempKey];
          if (componentData) {
            const newComponents = { ...prev };
            delete newComponents[tempKey];
            newComponents[message.id] = componentData;
            console.log('✅ Component data moved successfully');
            return newComponents;
          } else {
            console.log('⚠️ No component data found for temp key:', tempKey);
            return prev;
          }
        });
        lastDataQueryRef.current = null;
      }
      
      // Let the useEffect handle state updates - don't manually manage messages
      console.log('🎯 onFinish completed, letting useEffect handle state sync');
    },
  });

  // Update shared state whenever local state changes (deferred)
  useEffect(() => {
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
      console.log('🚀 Form submit with enhanced mode: ON');
      console.log('📝 Input message:', input);
      console.log('🔗 API endpoint:', '/api/chat', 'Enhanced: true');
      console.log('🧠 Memory enabled:', !!user?.id, 'UserID:', user?.id);
      
      setIsStopped(false);
      
      abortControllerRef.current = new AbortController();
      
      const isDataQuery = await detectDataQuery(input);
      console.log('🤖 Detected as data query:', isDataQuery);
      
      if (isDataQuery) {
        setIsDataLoading(true);
        const queryId = Date.now().toString();
        lastDataQueryRef.current = queryId;
        console.log('📊 Set data loading with query ID:', queryId);
      } else {
        lastDataQueryRef.current = null;
      }
      
      console.log('📤 Submitting to API...');
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