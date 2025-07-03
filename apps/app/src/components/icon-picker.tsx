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
          className={cn("w-12 h-12 p-0 rounded-full", className)}
        >
          <WatchlistGroupIcon icon={value} size={20} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 z-[10000]" align="start">
        <Tabs defaultValue="emojis" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="emojis">Emojis</TabsTrigger>
            <TabsTrigger value="icons">Icons</TabsTrigger>
          </TabsList>
          
          <TabsContent value="emojis" className="p-4 space-y-2">
            <div className="text-sm font-medium mb-3">Choose an emoji</div>
            <div className="grid grid-cols-8 gap-2">
              {AVAILABLE_ICONS.emojis.map((emoji) => (
                <Button
                  key={emoji.key}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0 hover:bg-accent",
                    value === emoji.key && "bg-accent"
                  )}
                  onClick={() => handleSelect(emoji.key)}
                  title={emoji.label}
                >
                  <span style={{ fontSize: 16 }}>{emoji.emoji}</span>
                </Button>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="icons" className="p-4 space-y-2">
            <div className="text-sm font-medium mb-3">Choose an icon</div>
            <div className="grid grid-cols-6 gap-2">
              {AVAILABLE_ICONS.icons.map((icon) => (
                <Button
                  key={icon.key}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0 hover:bg-accent",
                    value === icon.key && "bg-accent"
                  )}
                  onClick={() => handleSelect(icon.key)}
                  title={icon.label}
                >
                  <WatchlistGroupIcon icon={icon.key} size={16} />
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
} 