'use client'

import {
  IconAmericanFootballFill,
  IconBalloonFill,
  IconBanknoteFill,
  IconBellFill,
  IconBitcoinsignCircleFill,
  IconBoltFill,
  IconBookmarkFill,
  IconCameraFill,
  IconCatFill,
  IconChartBar,
  IconChartLineDowntrendXyaxis,
  IconChartLineUptrendXyaxis,
  IconCircleDottedAndCircle,
  IconCrownFill,
  IconDiamondFill,
  IconDogFill,
  IconEyeFill,
  IconFishFill,
  IconFlagFill,
  IconFlameFill,
  IconGamecontrollerFill,
  IconGiftFill,
  IconGlobeAmericasFill,
  IconGraduationcapFill,
  IconHeartFill,
  IconHouseFill,
  IconInfinityCircleFill,
  IconLeafFill,
  IconMoonStars,
  IconPartyPopperFill,
  IconPawprintFill,
  IconRainbow,
  IconSealFill,
  IconShieldFill,
  IconSketchLogo,
  IconSparkles,
  IconStarFill,
  IconTarget,
  IconTimelapse,
  IconTreeFill,
  IconTrophyFill,
  IconVolleyballFill,
  IconWalletBifoldFill,
} from 'symbols-react'
import { cn } from '@v1/ui/cn'

interface WatchlistGroupIconProps {
  icon?: string
  className?: string
  size?: number
}

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
  '📈': '📈',
  '📉': '📉',
  '💹': '💹',
  '📊': '📊',
  '🏦': '🏦',
  '🧠': '🧠',
  '🏆': '🏆',
  '🎁': '🎁',
  '🐋': '🐋',
  '🦅': '🦅',
  '🌊': '🌊',
  '☀️': '☀️',
  '🍀': '🍀',
  '✨': '✨',
  '🤖': '🤖',
  '🪙': '🪙',
  '⚙️': '⚙️',
  '🛡️': '🛡️',
  '🌍': '🌍',
  '👀': '👀',
  '🧪': '🧪',
  '🏠': '🏠',
  '🎵': '🎵',
  '🍕': '🍕',
  '⚽': '⚽',
  '🎮': '🎮',
  '💼': '💼',
  '🧊': '🧊',

  // Symbols React icons
  sparkles: IconSparkles,
  'graduation-cap': IconGraduationcapFill,
  star: IconStarFill,
  fire: IconFlameFill,
  lightning: IconBoltFill,
  diamond: IconDiamondFill,
  crown: IconCrownFill,
  target: IconTarget,
  moon: IconMoonStars,
  'american-football': IconAmericanFootballFill,
  volleyball: IconVolleyballFill,
  chart: IconChartLineUptrendXyaxis,
  'chart-down': IconChartLineDowntrendXyaxis,
  bars: IconChartBar,
  eye: IconEyeFill,
  time: IconTimelapse,
  bell: IconBellFill,
  heart: IconHeartFill,
  bookmark: IconBookmarkFill,
  sketch: IconSketchLogo,
  seal: IconSealFill,
  dots: IconCircleDottedAndCircle,

  banknote: IconBanknoteFill,
  bitcoin: IconBitcoinsignCircleFill,
  wallet: IconWalletBifoldFill,
  globe: IconGlobeAmericasFill,
  shield: IconShieldFill,
  trophy: IconTrophyFill,
  gift: IconGiftFill,
  leaf: IconLeafFill,
  tree: IconTreeFill,
  pawprint: IconPawprintFill,
  fish: IconFishFill,
  cat: IconCatFill,
  dog: IconDogFill,
  party: IconPartyPopperFill,
  balloon: IconBalloonFill,
  rainbow: IconRainbow,
  infinity: IconInfinityCircleFill,
  house: IconHouseFill,
  flag: IconFlagFill,
  camera: IconCameraFill,
  game: IconGamecontrollerFill,
} as const

export function WatchlistGroupIcon({ icon, className, size = 20 }: WatchlistGroupIconProps) {
  const iconKey = icon || 'sparkles'
  const IconComponent = ICON_MAP[iconKey as keyof typeof ICON_MAP]

  if (typeof IconComponent === 'string') {
    return (
      <span className={cn('flex items-center justify-center', className)} style={{ fontSize: size }}>
        {IconComponent}
      </span>
    )
  }

  if (IconComponent) {
    return (
      <IconComponent className={cn('flex-shrink-0 fill-current', className)} style={{ width: size, height: size }} />
    )
  }

  return (
    <IconSparkles className={cn('flex-shrink-0 fill-current', className)} style={{ width: size, height: size }} />
  )
}
