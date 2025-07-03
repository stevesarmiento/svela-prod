'use client'

import { useState } from 'react'
import { Button } from '@v1/ui/button'
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@v1/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@v1/ui/tabs'
import { WatchlistGroupIcon, AVAILABLE_ICONS } from './watchlist-group-icon'
import { cn } from '@v1/ui/cn'

interface IconPickerProps {
  value?: string
  onSelect: (icon: string) => void
  className?: string
}

export function IconPicker({ value, onSelect, className }: IconPickerProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (iconKey: string) => {
    onSelect(iconKey)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-12 h-12 p-0 rounded-xl bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800", className)}
        >
          <WatchlistGroupIcon icon={value} size={20} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-xl bg-zinc-900" align="start">
        <Tabs defaultValue="emojis" className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-zinc-950/40 rounded-t-xl p-1.5 border-b border-zinc-800 h-12">
            <TabsTrigger 
              value="emojis" 
              className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:border-zinc-700/50 border-transparent border data-[state=active]:shadow-md data-[state=active]:shadow-black/10"
            >
              Emojis
            </TabsTrigger>
            <TabsTrigger 
              value="icons" 
              className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:border-zinc-700/50 border-transparent border data-[state=active]:shadow-md data-[state=active]:shadow-black/10"
            >
              Icons
            </TabsTrigger>
          </TabsList>
          
          <div className="p-2">
            <TabsContent value="emojis" className="mt-2">
              <div className="grid grid-cols-4 gap-2">
                {AVAILABLE_ICONS.emojis.map((emoji) => (
                  <Button
                    key={emoji.key}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-10 w-10 p-0 rounded-lg hover:bg-zinc-800",
                      value === emoji.key && "bg-zinc-800 ring-2 ring-white/20"
                    )}
                    onClick={() => handleSelect(emoji.key)}
                    title={emoji.label}
                  >
                    <span style={{ fontSize: 20 }}>{emoji.emoji}</span>
                  </Button>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="icons" className="mt-2">
              <div className="grid grid-cols-4 gap-2">
                {AVAILABLE_ICONS.icons.map((icon) => (
                  <Button
                    key={icon.key}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-10 w-10 p-0 rounded-lg hover:bg-zinc-800",
                      value === icon.key && "bg-zinc-800 ring-2 ring-white/20"
                    )}
                    onClick={() => handleSelect(icon.key)}
                    title={icon.label}
                  >
                    <WatchlistGroupIcon icon={icon.key} size={20} />
                  </Button>
                ))}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
} 