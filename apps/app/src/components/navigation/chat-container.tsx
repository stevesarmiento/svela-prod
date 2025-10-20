'use client'

import React, { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@v1/ui/button'
import { Input } from '@v1/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@v1/ui/tooltip'
import { IconCaptionsBubbleFill, IconCommand, IconPaperplaneFill, IconXmark} from 'symbols-react'
import { useOverlayState, useChatContext } from './bottom-nav-context'
import { useClickOutside } from '@v1/ui/hooks'
import { useChatState } from '../chat/chat-toast'
import { ChatDialog } from '../chat/chat-dialog'
import { BackgroundPattern } from './background-pattern'
import { isAlphaFeaturesEnabled } from '@/lib/feature-flags';

export function ChatContainer() {
  const { isChatOpen, setIsChatOpen } = useOverlayState()
  const { openChat, isChatDialogOpen, openChatDialog, closeChatDialog } = useChatContext()
  
  const {
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    isDataLoading,
    isStopped,
    stop
  } = useChatState()
  
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isRequestActive = isLoading || isDataLoading

  // Only close on click outside if not actively typing or processing, and dialog is not open
  useClickOutside(containerRef as React.RefObject<HTMLElement>, (event) => {
    const target = event.target as Element
    const isToastClick = target.closest('[data-sonner-toast]') || 
                        target.closest('[data-toast]') ||
                        target.closest('.toaster') ||
                        target.closest('[class*="toast"]')
    const isDialogClick = target.closest('[data-radix-dialog-content]') ||
                         target.closest('[data-radix-dialog-overlay]')
    
    // Don't close chat input if dialog is open, or if clicking on dialog/toast elements
    if (isChatOpen && !isChatDialogOpen && !isRequestActive && !input.trim() && !isToastClick && !isDialogClick) {
      setIsChatOpen(false)
    }
  })

  useEffect(() => {
    if (isChatOpen && inputRef.current) {
      // Small delay to ensure dialog animations don't interfere
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
        }
      }, 100)
    }
  }, [isChatOpen, isChatDialogOpen])

  // Handle escape key to close chat (but not when dialog is open)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isChatOpen && !isChatDialogOpen) {
        setIsChatOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isChatOpen, isChatDialogOpen, setIsChatOpen])

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isRequestActive && stop) {
      stop()
    } else if (!isRequestActive && input.trim()) {
      openChatDialog()
      handleSubmit(e)
    }
  }

  const getStatusMessage = () => {
    if (isStopped) return "Request stopped by user"
    if (isDataLoading) return "Fetching live data..."
    if (isLoading) return "Thinking..."
    return null
  }

  return !isAlphaFeaturesEnabled() && (
    <motion.div
      ref={containerRef}
      layout
      data-chat-container="true"
      className={`relative rounded-[20px] bg-white/95 backdrop-blur-md border border-gray-200/50 dark:bg-zinc-900 dark:border-transparent overflow-hidden transition-all duration-300 ease-out
                 shadow-[0_4px_8px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)]
                 dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_30px_rgba(47,44,48,0.9),0_4px_16px_rgba(0,0,0,0.6)]
                 ${isChatDialogOpen ? 'z-[10000]' : ''}`}
      animate={{ 
        width: isChatOpen ? '460px' : '54px',
        height: isChatOpen ? '54px' : '54px'
      }}
      transition={{
        duration: 0.1,
        ease: [0.4, 0, 0.2, 1]
      }}
    >
      {/* React 19: Optimized shared background pattern */}
      <BackgroundPattern />
      
      <div className="relative z-10 h-full">
        <AnimatePresence mode="wait">
          {!isChatOpen ? (
            <motion.div
              key="chat-button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.1,
                ease: [0.4, 0, 0.2, 1]
              }}
              className="h-full flex items-center justify-center"
            >
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="p-0 h-[54px] w-[54px] hover:bg-gray-100/40 dark:hover:bg-zinc-800/40 group" 
                    onClick={openChat}
                    aria-label="Open chat"
                  >
                    <IconCaptionsBubbleFill className="h-4 w-4 fill-gray-600 group-hover:fill-gray-900 dark:fill-white/70 dark:group-hover:fill-white transition-all duration-200" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={5} className="flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border-gray-200 dark:border-zinc-800 border bg-white/95 dark:bg-zinc-900/95 shadow-sm">
                  <span className="text-xs text-gray-600 dark:text-zinc-400">Quick Chat</span>
                  <kbd className="flex items-center gap-1 rounded-md bg-gray-100 dark:bg-zinc-700 px-1.5 py-0.5 text-xs font-diatype-mono text-gray-700 dark:text-zinc-300 uppercase">
                    <IconCommand className="h-2.5 w-2.5 fill-gray-700 dark:fill-zinc-300" />
                    <span>+ J</span>
                  </kbd>
                </TooltipContent>
              </Tooltip>
            </motion.div>
          ) : (
            <motion.div
              key="chat-input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.1,
                ease: [0.4, 0, 0.2, 1]
              }}
              onAnimationComplete={() => {
                // Focus input when animation completes
                if (inputRef.current) {
                  inputRef.current.focus()
                }
              }}
              className="h-[54px]"
            >
              <form onSubmit={handleFormSubmit} className="h-full">
                <div className="flex items-center gap-3 p-3 h-full">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Ask about crypto prices, market trends..."
                    disabled={isRequestActive}
                    className="flex-1 border-0 bg-transparent text-md text-gray-900 placeholder:text-gray-500 dark:text-white dark:placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0 h-[54px] p-0 pl-2"
                  />
                  
                  <Button 
                    type="submit" 
                    disabled={!isRequestActive && !input.trim()}
                    variant={isRequestActive ? "destructive" : "default"}
                    size="icon"
                    className="group transition-all duration-200 h-8 w-8"
                    title={isRequestActive ? "Stop request" : "Send message"}
                  >
                    {isRequestActive ? (
                      <IconXmark className="size-3 fill-white" />
                    ) : (
                      <IconPaperplaneFill className="size-4 fill-white" />
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Status Message */}
      <AnimatePresence>
        {getStatusMessage() && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{
                duration: 0.1,
                ease: [0.4, 0, 0.2, 1]
              }}
            className={`absolute top-full left-4 mt-2 flex items-center gap-2 text-sm ${
              isStopped ? 'text-red-400' : 'text-gray-600 dark:text-white/70'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${
              isStopped ? 'bg-red-400' : 'bg-blue-400 animate-pulse'
            }`} />
            <span>{getStatusMessage()}</span>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Chat Dialog */}
      <ChatDialog 
        open={isChatDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            closeChatDialog()
          }
        }}
      />
    </motion.div>
  )
} 