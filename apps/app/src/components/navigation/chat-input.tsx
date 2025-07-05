'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@v1/ui/button'
import { Input } from '@v1/ui/input'
import { IconPaperplaneFill, IconXmarkCircleFill } from 'symbols-react'
import { useBottomNav } from './bottom-nav-context'
import { useClickOutside } from '@v1/ui/hooks'

interface ChatInputProps {
  onSubmit: (message: string) => void
  onStop?: () => void
  isLoading?: boolean
  isDataLoading?: boolean
  isStopped?: boolean
}

export function ChatInput({
  onSubmit,
  onStop,
  isLoading = false,
  isDataLoading = false,
  isStopped = false,
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const { isChatOpen, setIsChatOpen } = useBottomNav()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isRequestActive = isLoading || isDataLoading

  useClickOutside(containerRef as React.RefObject<HTMLElement>, () => {
    if (isChatOpen) {
      setIsChatOpen(false)
    }
  })

  useEffect(() => {
    if (isChatOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isChatOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isRequestActive && onStop) {
      onStop()
    } else if (!isRequestActive && input.trim()) {
      onSubmit(input.trim())
      setInput('')
    }
  }

  const getButtonContent = () => {
    if (isRequestActive) {
      return <IconXmarkCircleFill className="w-6 h-6 fill-red-400 group-hover:fill-red-300" />
    }
    return <IconPaperplaneFill className="w-6 h-6 fill-white/50 group-hover:fill-white" />
  }

  const getStatusMessage = () => {
    if (isStopped) {
      return "Request stopped by user"
    }
    if (isDataLoading) {
      return "Fetching live data..."
    }
    if (isLoading) {
      return "Thinking..."
    }
    return null
  }

  if (!isChatOpen) return null

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{
        type: "spring",
        stiffness: 280,
        damping: 18,
        mass: 0.3,
      }}
    >
      <form onSubmit={handleSubmit}>
        <div className="relative backdrop-blur-md rounded-[20px] bg-zinc-900 focus-within:bg-zinc-950/50 overflow-hidden p-1 transition-colors duration-200
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
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about crypto prices, market trends, or anything else..."
              disabled={isRequestActive}
              className="flex-1 border-0 bg-transparent text-lg text-white placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            
            <Button 
              type="submit" 
              disabled={!isRequestActive && !input.trim()}
              size="icon"
              className={`group transition-all duration-200 ${
                isRequestActive 
                  ? 'bg-red-500/20 hover:bg-red-500/30' 
                  : 'bg-white/0 hover:bg-white/10'
              }`}
              title={isRequestActive ? "Stop request" : "Send message"}
            >
              {getButtonContent()}
            </Button>
          </div>
        </div>
      </form>
      
      {getStatusMessage() && (
        <div className={`absolute top-full left-4 mt-2 flex items-center gap-2 text-sm ${
          isStopped ? 'text-red-400' : 'text-white/70'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isStopped ? 'bg-red-400' : 'bg-blue-400 animate-pulse'
          }`} />
          <span>{getStatusMessage()}</span>
        </div>
      )}
    </motion.div>
  )
} 