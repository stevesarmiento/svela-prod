'use client'

import { 
  List,
  Heart,
  Star,
  Trophy,
  Target,
  Zap,
  Flame,
  Rocket,
  TrendingUp,
  Eye,
  Shield,
  Diamond,
  Crown,
  Activity
} from 'lucide-react'
import { 
  IconCircleDottedAndCircle,
  IconSparkles,
  IconBookmarkFill,
  IconChartLineUptrendXyaxis,
  IconArrowUpRight,
  IconGear
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
  
  // Lucide icons
  'list': List,
  'heart': Heart,
  'star': Star,
  'trophy': Trophy,
  'target': Target,
  'zap': Zap,
  'flame': Flame,
  'rocket': Rocket,
  'trending-up': TrendingUp,
  'eye': Eye,
  'shield': Shield,
  'diamond': Diamond,
  'crown': Crown,
  'activity': Activity,
  
  // Symbols React icons
  'circle-dotted': IconCircleDottedAndCircle,
  'sparkles': IconSparkles,
  'bookmark': IconBookmarkFill,
  'chart-trend': IconChartLineUptrendXyaxis,
  'arrow-up': IconArrowUpRight,
  'gear': IconGear,
}

export function WatchlistGroupIcon({ icon, className, size = 20 }: WatchlistGroupIconProps) {
  // Default to list icon if no icon specified
  const iconKey = icon || 'list'
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
        className={cn("flex-shrink-0", className)} 
        style={{ width: size, height: size }}
      />
    )
  }
  
  // Fallback to default list icon
  return (
    <List 
      className={cn("flex-shrink-0", className)} 
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
    { key: 'list', label: 'List' },
    { key: 'heart', label: 'Heart' },
    { key: 'star', label: 'Star' },
    { key: 'trophy', label: 'Trophy' },
    { key: 'target', label: 'Target' },
    { key: 'zap', label: 'Zap' },
    { key: 'flame', label: 'Flame' },
    { key: 'rocket', label: 'Rocket' },
    { key: 'trending-up', label: 'Trending Up' },
    { key: 'eye', label: 'Eye' },
    { key: 'shield', label: 'Shield' },
    { key: 'diamond', label: 'Diamond' },
    { key: 'crown', label: 'Crown' },
    { key: 'activity', label: 'Activity' },
    { key: 'circle-dotted', label: 'Circle Dotted' },
    { key: 'sparkles', label: 'Sparkles' },
    { key: 'bookmark', label: 'Bookmark' },
    { key: 'chart-trend', label: 'Chart Trend' },
    { key: 'arrow-up', label: 'Arrow Up' },
    { key: 'gear', label: 'Gear' },
  ]
} 