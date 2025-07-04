'use client'

import { 
  IconCircleDottedAndCircle,
  IconSparkles,
  IconBookmarkFill,
  IconChartLineUptrendXyaxis,
  IconGraduationcapFill,
  IconStarFill,
  IconFlameFill,
  IconBoltFill,
  IconSketchLogo,
  IconCrownFill,
  IconTarget,
  IconMoonStars,
  IconAmericanFootballFill,
  IconVolleyballFill,
  IconEyeFill,
  IconTimelapse,
  IconBellFill,
  IconHeartFill,
  IconDiamondFill,
  IconChartBar,
  IconSealFill
} from 'symbols-react'
import { cn } from '@v1/ui/cn'

interface WatchlistGroupIconProps {
  icon?: string
  className?: string
  size?: number
}

// Map of available icons - you can add more here
const ICON_MAP = {
  // Emojis
  '💩': '💩',
  '🚀': '🚀', 
  '💎': '💎',
  '🔥': '🔥',
  '⭐': '⭐',
  '👑': '👑',
  '🎯': '🎯',
  '💰': '💰',
  '🌙': '🌙',
  '⚡': '⚡',
  '🦄': '🦄',
  '🐻': '🐻',
  '🐂': '🐂',
  '💀': '💀',
  '🎪': '🎪',
  '🌈': '🌈',
  '🔮': '🔮',
  '🎭': '🎭',
  '🎲': '🎲',
  '🎨': '🎨',
  
  // Symbols React icons
  'sparkles': IconSparkles,
  'graduation-cap': IconGraduationcapFill,
  'star': IconStarFill,
  'fire': IconFlameFill,
  'lightning': IconBoltFill,
  'diamond': IconDiamondFill,
  'crown': IconCrownFill,
  'target': IconTarget,
  'moon': IconMoonStars,
  'american-football': IconAmericanFootballFill,
  'volleyball': IconVolleyballFill,
  'chart': IconChartLineUptrendXyaxis,
  'bars': IconChartBar,
  'eye': IconEyeFill,
  'time': IconTimelapse,
  'bell': IconBellFill,
  'heart': IconHeartFill,
  'bookmark': IconBookmarkFill,
  'sketch': IconSketchLogo,
  'seal': IconSealFill,
  'dots': IconCircleDottedAndCircle,
}

export function WatchlistGroupIcon({ icon, className, size = 20 }: WatchlistGroupIconProps) {
  // Default to sparkles icon if no icon specified
  const iconKey = icon || 'sparkles'
  const IconComponent = ICON_MAP[iconKey as keyof typeof ICON_MAP]
  
  // If it's an emoji (string that's not in our icon map but exists in the emoji section)
  if (typeof IconComponent === 'string') {
    return (
      <span 
        className={cn("flex items-center justify-center", className)}
        style={{ fontSize: size }}
      >
        {IconComponent}
      </span>
    )
  }
  
  // If it's a React component (icon)
  if (IconComponent) {
    return (
      <IconComponent 
        className={cn("flex-shrink-0 fill-current", className)} 
        style={{ width: size, height: size }}
      />
    )
  }
  
  // Fallback to sparkles icon
  return (
    <IconSparkles 
      className={cn("flex-shrink-0 fill-current", className)} 
      style={{ width: size, height: size }}
    />
  )
}

// Export the available icons for use in UI selection
export const AVAILABLE_ICONS = {
  emojis: [
    { key: '💩', label: 'Poop', emoji: '💩' },
    { key: '🚀', label: 'Rocket', emoji: '🚀' },
    { key: '💎', label: 'Diamond', emoji: '💎' },
    { key: '🔥', label: 'Fire', emoji: '🔥' },
    { key: '⭐', label: 'Star', emoji: '⭐' },
    { key: '👑', label: 'Crown', emoji: '👑' },
    { key: '🎯', label: 'Target', emoji: '🎯' },
    { key: '💰', label: 'Money', emoji: '💰' },
    { key: '🌙', label: 'Moon', emoji: '🌙' },
    { key: '⚡', label: 'Lightning', emoji: '⚡' },
    { key: '🦄', label: 'Unicorn', emoji: '🦄' },
    { key: '🐻', label: 'Bear', emoji: '🐻' },
    { key: '🐂', label: 'Bull', emoji: '🐂' },
    { key: '💀', label: 'Skull', emoji: '💀' },
    { key: '🎪', label: 'Circus', emoji: '🎪' },
    { key: '🌈', label: 'Rainbow', emoji: '🌈' },
    { key: '🔮', label: 'Crystal Ball', emoji: '🔮' },
    { key: '🎭', label: 'Theater', emoji: '🎭' },
    { key: '🎲', label: 'Dice', emoji: '🎲' },
    { key: '🎨', label: 'Art', emoji: '🎨' },
  ],
  icons: [
    { key: 'sparkles', label: 'Sparkles' },
    { key: 'graduation-cap', label: 'Graduation Cap' },
    { key: 'star', label: 'Star' },
    { key: 'fire', label: 'Flame' },
    { key: 'lightning', label: 'Lightning' },
    { key: 'crown', label: 'Crown' },
    { key: 'target', label: 'Target' },
    { key: 'moon', label: 'Moon' },
    { key: 'chart', label: 'Chart' },
    { key: 'bars', label: 'Bars' },
    { key: 'eye', label: 'Eye' },
    { key: 'time', label: 'Time' },
    { key: 'bell', label: 'Bell' },
    { key: 'heart', label: 'Heart' },
    { key: 'bookmark', label: 'Bookmark' },
    { key: 'seal', label: 'Seal' },
    { key: 'dots', label: 'Dots' },
    { key: 'american-football', label: 'American Football' },
    { key: 'volleyball', label: 'Volleyball' },
    { key: 'sketch', label: 'Sketch' },
  ]
} 