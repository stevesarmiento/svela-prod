'use client'

import React, { useDeferredValue } from 'react'
import { useAuth } from '@v1/convex/hooks'
import { autoCleanupSessionMemories } from '@/lib/client-memory-utils'
import { useChatStateSync } from './hooks/use-chat-state-sync'
import { Button } from '@v1/ui/button'
import { IconXmarkCircleFill } from 'symbols-react'
import { ChatMessageList } from './chat-message-list'
import { Dialog, DialogContent } from '@v1/ui/dialog-two'

interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EnhancedIndicator() {
  return (
    <div className="flex items-center gap-1 text-blue-500">
      <span className="text-xs text-blue-400">🚀</span>
    </div>
  );
}

function ChatDialogContent({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  
  // Using the same optimized state sync as the toast version
  const chatState = useChatStateSync();
  
  // React 19: Defer expensive chat state updates
  const deferredChatState = useDeferredValue(chatState);

  // Auto-cleanup session memories if enabled
  const autoCleanupSession = React.useCallback(async () => {
    if (!user?.id) return;
    await autoCleanupSessionMemories(user.id);
  }, [user?.id]);

  const handleClose = React.useCallback(async () => {
    // Auto-cleanup session if enabled
    await autoCleanupSession();
    
    if (onClose) {
      onClose();
    }
  }, [autoCleanupSession, onClose]);

  if (!deferredChatState) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="text-center space-y-2">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Initializing chat...</p>
        </div>
      </div>
    );
  }

  const { messages, isLoading, isDataLoading, messageComponents } = deferredChatState;
  const hasMessages = messages && messages.length > 0;
  const hasActivity = isLoading || isDataLoading;

  return (
    <div className="flex flex-col h-[70vh] min-h-[500px] max-h-[800px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 sr-only">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Chat Assistant</h2>
            {hasActivity && <EnhancedIndicator />}
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleClose}
          className="h-8 w-8 rounded-full"
        >
          <IconXmarkCircleFill className="h-4 w-4" />
        </Button>
      </div>

      {/* Chat Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {hasMessages ? (
          <ChatMessageList
            messages={messages}
            isLoading={isLoading}
            isDataLoading={isDataLoading}
            messageComponents={messageComponents}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4 p-8">
              <div className="text-6xl opacity-50">💬</div>
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Start a conversation</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Ask about crypto prices, market trends, or get help with trading decisions.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatDialog({ open, onOpenChange }: ChatDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-4xl w-[90vw] p-0 translate-y-[-60%] top-[45%]"
        hideTitle={true}
        title="Chat Assistant"
        preventCloseOnOutsideClick={true}
        preventCloseOnEscape={true}
      >
        <ChatDialogContent onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
