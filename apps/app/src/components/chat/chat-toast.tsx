'use client'

import React, { useRef, useEffect, useDeferredValue } from 'react'
import { 
  useChat, 
  useChatMessages, 
  useChatStatus, 
  useChatError,
  useChatActions 
} from '@ai-sdk-tools/store'
import { useAuth } from '@v1/convex/hooks'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { autoCleanupSessionMemories, bulkCleanupMemories } from '@/lib/client-memory-utils'
import { useChatContext } from '@/lib/chat-context'
import { Button } from '@v1/ui/button'
import { ScrollArea } from '@v1/ui/scroll-area'
import { IconXmarkCircleFill } from 'symbols-react'
import { ChatMessageList } from './chat-message-list'
import GradualBlur from '@v1/ui/progressive-blur'
import type { Message } from 'ai'

// Use shared types from ./types to avoid duplicates

// Enhanced indicator component (always enhanced now)
function EnhancedIndicator() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-blue-400">Enhanced</span>
      <span className="text-xs text-blue-400">🚀</span>
    </div>
  );
}

// Simplified chat toast component using global store selectors
function ChatToastContent({ toastId, onClose }: { toastId: string | number; onClose?: () => void }) {
  const { user } = useAuth();
  
  // Use store selectors to access global chat state
  const messages = useChatMessages();
  const status = useChatStatus();
  const isLoading = status === 'streaming';
  
  // Get application-specific state from context 
  const { isDataLoading, messageComponents } = useChatContext();
  
  // Defer expensive messages for better performance
  const deferredMessages = useDeferredValue(messages);
  
  // Debug: Log messages to see what's happening
  console.log('ChatToastContent - messages:', messages);
  console.log('ChatToastContent - status:', status);

  // Auto-cleanup session memories if enabled
  const autoCleanupSession = React.useCallback(async () => {
    if (!user?.id) return;
    await autoCleanupSessionMemories(user.id);
  }, [user?.id]);

  const handleClose = React.useCallback(async () => {
    // Note: Bulk archiving is handled by the toast's onDismiss callback
    // Auto-cleanup session if enabled
    await autoCleanupSession();
    
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

  if (!deferredMessages || deferredMessages.length === 0) {
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
            messages={deferredMessages}
            isLoading={isLoading}
            isDataLoading={isDataLoading}
            userImage={user?.avatarUrl}
            userName={user?.fullName || user?.email?.split('@')[0]}
            messageComponents={messageComponents}
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
        toastIdRef.current = null;
        
        // Background cleanup operations
        if (user?.id) {
          // Use Promise.resolve to ensure these run after the current render cycle
          Promise.resolve().then(async () => {
            try {
              await bulkDeleteChatMemories();
              await autoCleanupSessionMemories(user.id);
            } catch (error) {
              console.error('Failed to cleanup on dismiss:', error);
            }
          });
        }
      }
    });
  };

  const closeChatToast = async () => {
    if (toastIdRef.current) {
      // Dismiss the toast
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

// Initialize chat once with proper transport configuration
export function useChatState() {
  const { user } = useAuth();
  
  // Get application-specific state from context
  const {
    isDataLoading,
    setIsDataLoading,
    messageComponents,
    setMessageComponents,
    lastDataQueryRef,
    abortControllerRef,
    isStopped,
    setIsStopped,
  } = useChatContext();
  
  // Initialize chat (this creates the global store)
  const chat = useChat({
    api: '/api/chat',
    body: {
      userId: user?.id || null, // 🚀 Add userId for memory functionality
    },
    initialMessages: [],
    onResponse: async (response: Response) => {
      // Check if this is an enhanced response
      const isEnhancedResponse = response.headers.get('X-Enhanced-Chat') === 'true';
      
      if (isEnhancedResponse) {
        // Handle enhanced response from headers
        const componentDataHeader = response.headers.get('X-Component-Data');
        
        if (componentDataHeader && lastDataQueryRef.current) {
          try {
            const componentData = JSON.parse(componentDataHeader);
            
            setMessageComponents(prev => ({
              ...prev,
              [`temp_${lastDataQueryRef.current}`]: componentData
            }));
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
          setMessageComponents(prev => ({
            ...prev,
            [`temp_${lastDataQueryRef.current}`]: parsedComponentData
          }));
        } catch (err) {
          console.error('Failed to parse component data:', err);
          }
        }
      }
    },
    onFinish: async (message: Message) => {
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

  // State is now managed globally by @ai-sdk-tools/store - no manual sync needed

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
    if (chat.input.trim() && status !== 'streaming') {
      setIsStopped(false);
      abortControllerRef.current = new AbortController();
      
      const isDataQuery = await detectDataQuery(chat.input);
      
      if (isDataQuery) {
        setIsDataLoading(true);
        const queryId = Date.now().toString();
        lastDataQueryRef.current = queryId;
      } else {
        lastDataQueryRef.current = null;
      }
      
      // Use original handleSubmit for now (it was working)
      chat.handleSubmit(e);
    }
  };

  const handleStop = () => {
    // Use original stop function for now
    chat.stop();
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setIsDataLoading(false);
    setIsStopped(true);
    
    // Reset stopped state after delay (no need for transition here)
    setTimeout(() => {
      setIsStopped(false);
    }, 3000);
  };

  // Use selectors to get global state (not from chat object)
  const messages = useChatMessages();
  const status = useChatStatus(); 
  const error = useChatError();
  const actions = useChatActions();
  
  // Debug: Check what actions are available
  console.log('useChatActions result:', actions);
  console.log('sendMessage function:', actions?.sendMessage);
  
  return {
    messages,
    input: chat.input, // Input still comes from the initialized chat
    handleInputChange: chat.handleInputChange,
    handleSubmit: handleFormSubmit,
    isLoading: status === 'streaming',
    isDataLoading,
    messageComponents,
    error,
    stop: handleStop,
    isStopped,
    // isPending removed - not needed with current implementation
  };
}

// Legacy component for backward compatibility - renders nothing
export function ChatToast() {
  return null;
} 