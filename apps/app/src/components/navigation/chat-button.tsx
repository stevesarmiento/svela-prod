'use client'

import React from 'react'
import { Button } from '@v1/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@v1/ui/tooltip'
import { IconBubbleLeftFill, IconCommand } from 'symbols-react'
import { useBottomNav } from './bottom-nav-context'

export function ChatButton() {
  const { isChatOpen, openChat } = useBottomNav()

  return (
    <div className="relative rounded-[20px] bg-zinc-900 overflow-hidden px-2 py-0 hover:bg-zinc-800/80 transition-all duration-200 cursor-pointer
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
      
      <div className="relative z-10">
        <div className="flex items-center">
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="hover:bg-transparent p-0 h-[55px] w-[40px]" 
                onClick={openChat}
                aria-label="Open chat"
              >
                <IconBubbleLeftFill className="h-4 w-4 fill-white/70 hover:fill-white" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={25} className="flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border-zinc-800/20 border bg-none shadow-none">
              <span className="text-xs text-zinc-400">Quick Chat</span>
              <kbd className="flex items-center gap-1 rounded-md bg-zinc-700 px-1.5 py-0.5 text-xs font-mono text-zinc-300 uppercase">
                <IconCommand className="h-2.5 w-2.5 fill-zinc-300" />
                <span>+ J</span>
              </kbd>
            </TooltipContent>
          </Tooltip>
          <div 
            className={`overflow-hidden transition-all motion-ease-spring-bouncy motion-duration-200 ${isChatOpen ? 'w-[420px] opacity-100' : 'w-0 opacity-0'}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </div>
  )
}
