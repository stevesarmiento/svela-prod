'use client'

import { useState } from 'react'
import Image from "next/image"
import { Button } from "@v1/ui/button"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v1/ui/select"

const blendModes = [
  'normal',
  'multiply',
  'screen', 
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity'
] as const

type BlendMode = typeof blendModes[number]

interface BlendModeBackgroundProps {
  coinId: string
  tokenName: string
}

export function BlendModeBackground({ coinId, tokenName }: BlendModeBackgroundProps) {
  const [selectedBlendMode, setSelectedBlendMode] = useState<BlendMode>('normal')
  const [opacity, setOpacity] = useState(0.18)
  const [showControls, setShowControls] = useState(true)

  return (
    <>
      {/* Blend Mode Controls */}
      {showControls && (
        <div className="fixed top-4 right-4 z-50 bg-black/80 backdrop-blur-sm rounded-lg p-4 space-y-3 min-w-[200px]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Blend Mode Tester</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowControls(false)}
              className="h-6 w-6 p-0 text-white/70 hover:text-white"
            >
              ×
            </Button>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs text-white/70">Blend Mode</label>
            <Select value={selectedBlendMode} onValueChange={(value: BlendMode) => setSelectedBlendMode(value)}>
              <SelectTrigger className="w-full bg-white/10 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black/90 border-white/20">
                {blendModes.map((mode) => (
                  <SelectItem key={mode} value={mode} className="text-white hover:bg-white/10">
                    {mode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-white/70">Opacity: {(opacity * 100).toFixed(0)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={opacity}
              onChange={(e) => setOpacity(Number.parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="text-xs text-white/50 space-y-1">
            <div>Current: {selectedBlendMode}</div>
            <div>Opacity: {(opacity * 100).toFixed(0)}%</div>
          </div>
        </div>
      )}

      {/* Toggle button when controls are hidden */}
      {!showControls && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowControls(true)}
          className="fixed top-4 right-4 z-50 bg-black/80 backdrop-blur-sm text-white hover:bg-black/90"
        >
          Blend Mode
        </Button>
      )}

      {/* Blurred background token image */}
      <div 
        className="absolute z-0 pointer-events-none"
        style={{
          width: '700px',
          height: '700px',
          filter: 'blur(360px)',
          willChange: 'filter',
          opacity,
          left: '7vw',
          top: '-350px',
          mixBlendMode: selectedBlendMode
        }}
      >
        <Image
          src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coinId}.png`}
          alt={`${tokenName} background`}
          className="w-full h-full object-cover"
          width={700}
          height={700}
        />
      </div>
    </>
  )
}