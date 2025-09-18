'use client'

import React, { createContext, useContext, useState, useRef, ReactNode } from 'react'
import type { ComponentData } from '@/components/chat/types'

interface ChatContextState {
  isDataLoading: boolean
  setIsDataLoading: (loading: boolean) => void
  messageComponents: Record<string, ComponentData>
  setMessageComponents: React.Dispatch<React.SetStateAction<Record<string, ComponentData>>>
  lastDataQueryRef: React.MutableRefObject<string | null>
  abortControllerRef: React.MutableRefObject<AbortController | null>
  isStopped: boolean
  setIsStopped: (stopped: boolean) => void
}

const ChatContext = createContext<ChatContextState | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [messageComponents, setMessageComponents] = useState<Record<string, ComponentData>>({})
  const [isStopped, setIsStopped] = useState(false)
  const lastDataQueryRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  return (
    <ChatContext.Provider value={{
      isDataLoading,
      setIsDataLoading,
      messageComponents,
      setMessageComponents,
      lastDataQueryRef,
      abortControllerRef,
      isStopped,
      setIsStopped,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext() {
  const context = useContext(ChatContext)
  if (context === undefined) {
    throw new Error('useChatContext must be used within a ChatProvider')
  }
  return context
}
