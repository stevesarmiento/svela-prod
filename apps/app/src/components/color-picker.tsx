'use client'

import { useState } from 'react'
import { Button } from '@v1/ui/button'
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@v1/ui/popover'
import { cn } from '@v1/ui/cn'
import { Check } from 'lucide-react'

interface ColorPickerProps {
  value?: string
  onSelect: (color: string) => void
  className?: string
}

// Predefined color palette
export const COLORS = [
  // Row 1: Grays and Blues
  { name: 'Default', value: 'default', bg: 'bg-zinc-700', border: 'border-zinc-600' },
  { name: 'Slate', value: 'slate', bg: 'bg-slate-700', border: 'border-slate-600' },
  { name: 'Blue', value: 'blue', bg: 'bg-blue-700', border: 'border-blue-600' },
  { name: 'Sky', value: 'sky', bg: 'bg-sky-700', border: 'border-sky-600' },
  { name: 'Cyan', value: 'cyan', bg: 'bg-cyan-700', border: 'border-cyan-600' },
  { name: 'Teal', value: 'teal', bg: 'bg-teal-700', border: 'border-teal-600' },

  // Row 2: Purples and Pinks
  { name: 'Indigo', value: 'indigo', bg: 'bg-indigo-700', border: 'border-indigo-600' },
  { name: 'Purple', value: 'purple', bg: 'bg-purple-700', border: 'border-purple-600' },
  { name: 'Violet', value: 'violet', bg: 'bg-violet-700', border: 'border-violet-600' },
  { name: 'Pink', value: 'pink', bg: 'bg-pink-700', border: 'border-pink-600' },
  { name: 'Rose', value: 'rose', bg: 'bg-rose-700', border: 'border-rose-600' },
  { name: 'Red', value: 'red', bg: 'bg-red-700', border: 'border-rose-500' },

  // Row 3: Greens and Warm Colors
  { name: 'Emerald', value: 'emerald', bg: 'bg-emerald-700', border: 'border-emerald-600' },
  { name: 'Green', value: 'green', bg: 'bg-green-700', border: 'border-emerald-500' },
  { name: 'Lime', value: 'lime', bg: 'bg-lime-700', border: 'border-lime-600' },
  { name: 'Yellow', value: 'yellow', bg: 'bg-yellow-700', border: 'border-yellow-600' },
  { name: 'Amber', value: 'amber', bg: 'bg-amber-700', border: 'border-amber-600' },
  { name: 'Orange', value: 'orange', bg: 'bg-orange-700', border: 'border-orange-600' },

  // Row 4: Neutral ramp (extends zinc/slate from row 1 toward deep cool)
  { name: 'Stone', value: 'stone', bg: 'bg-stone-700', border: 'border-stone-600' },
  { name: 'Neutral', value: 'neutral', bg: 'bg-neutral-700', border: 'border-neutral-600' },
  { name: 'Gray', value: 'gray', bg: 'bg-gray-700', border: 'border-gray-600' },
  { name: 'Charcoal', value: 'charcoal', bg: 'bg-zinc-900', border: 'border-zinc-700' },
  { name: 'Ink', value: 'ink', bg: 'bg-slate-900', border: 'border-slate-700' },
  { name: 'Navy', value: 'navy', bg: 'bg-blue-950', border: 'border-blue-900' },

  // Row 5: Magenta through deep warm (extends rows 2–3 toward darker saturation)
  { name: 'Fuchsia', value: 'fuchsia', bg: 'bg-fuchsia-700', border: 'border-fuchsia-600' },
  { name: 'Plum', value: 'plum', bg: 'bg-purple-900', border: 'border-purple-700' },
  { name: 'Berry', value: 'berry', bg: 'bg-pink-900', border: 'border-pink-700' },
  { name: 'Wine', value: 'wine', bg: 'bg-rose-950', border: 'border-rose-800' },
  { name: 'Crimson', value: 'crimson', bg: 'bg-red-900', border: 'border-red-800' },
  { name: 'Rust', value: 'rust', bg: 'bg-orange-900', border: 'border-orange-800' },
]

export function ColorPicker({ value = 'default', onSelect, className }: ColorPickerProps) {
  const [open, setOpen] = useState(false)

  const selectedColor = COLORS.find(color => color.value === value) || COLORS[0]!

  const handleSelect = (colorValue: string) => {
    onSelect(colorValue)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-20 h-12 p-0 rounded-lg border relative overflow-hidden",
            selectedColor.bg,
            selectedColor.border,
            className
          )}
        >
          <div className="absolute inset-0 opacity-100" />
          <span className="relative z-10 text-xs font-medium text-white">
            {selectedColor.name}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 z-[10000]" align="start">
        <div className="space-y-2">
          <div className="text-sm font-medium mb-3">Choose a color theme</div>
          <div className="grid grid-cols-4 gap-2">
            {COLORS.map((color) => (
              <Button
                key={color.value}
                variant="ghost"
                className={cn(
                  "h-16 p-0 rounded-lg bg-gradient-to-b border relative overflow-hidden hover:scale-105 transition-transform",
                  color.bg,
                  color.border,
                  value === color.value && "ring-2 ring-white ring-offset-2 ring-offset-background"
                )}
                onClick={() => handleSelect(color.value)}
              >
                <div className="absolute inset-0 bg-gradient-to-b opacity-100" />
                <div className="relative z-10 flex flex-col items-center justify-center h-full">
                  {value === color.value && (
                    <Check className="w-4 h-4 text-white mb-1" />
                  )}
                  <span className="text-xs font-medium text-white">
                    {color.name}
                  </span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Export color mappings for use in components
export const COLOR_THEMES = {
  // Grays and Blues
  default: { bg: 'bg-zinc-700', border: 'border-zinc-600' },
  slate: { bg: 'bg-slate-700', border: 'border-slate-600' },
  blue: { bg: 'bg-blue-700', border: 'border-blue-600' },
  sky: { bg: 'bg-sky-700', border: 'border-sky-600' },
  cyan: { bg: 'bg-cyan-700', border: 'border-cyan-600' },
  teal: { bg: 'bg-teal-700', border: 'border-teal-600' },

  // Purples and Pinks
  indigo: { bg: 'bg-indigo-700', border: 'border-indigo-600' },
  purple: { bg: 'bg-purple-700', border: 'border-purple-600' },
  violet: { bg: 'bg-violet-700', border: 'border-violet-600' },
  pink: { bg: 'bg-pink-700', border: 'border-pink-600' },
  rose: { bg: 'bg-rose-700', border: 'border-rose-600' },
  red: { bg: 'bg-red-700', border: 'border-rose-500' },

  // Greens and Warm Colors
  emerald: { bg: 'bg-emerald-700', border: 'border-emerald-600' },
  green: { bg: 'bg-green-700', border: 'border-emerald-500' },
  lime: { bg: 'bg-lime-700', border: 'border-lime-600' },
  yellow: { bg: 'bg-yellow-700', border: 'border-yellow-600' },
  amber: { bg: 'bg-amber-700', border: 'border-amber-600' },
  orange: { bg: 'bg-orange-700', border: 'border-orange-600' },

  // Row 4–5 extended themes (see COLORS)
  stone: { bg: 'bg-stone-700', border: 'border-stone-600' },
  neutral: { bg: 'bg-neutral-700', border: 'border-neutral-600' },
  gray: { bg: 'bg-gray-700', border: 'border-gray-600' },
  charcoal: { bg: 'bg-zinc-900', border: 'border-zinc-700' },
  ink: { bg: 'bg-slate-900', border: 'border-slate-700' },
  navy: { bg: 'bg-blue-950', border: 'border-blue-900' },

  fuchsia: { bg: 'bg-fuchsia-700', border: 'border-fuchsia-600' },
  plum: { bg: 'bg-purple-900', border: 'border-purple-700' },
  berry: { bg: 'bg-pink-900', border: 'border-pink-700' },
  wine: { bg: 'bg-rose-950', border: 'border-rose-800' },
  crimson: { bg: 'bg-red-900', border: 'border-red-800' },
  rust: { bg: 'bg-orange-900', border: 'border-orange-800' },

  // Legacy key: older picks map to the closest theme in the neutral ramp
  midnight: { bg: 'bg-slate-900', border: 'border-slate-700' },
} 