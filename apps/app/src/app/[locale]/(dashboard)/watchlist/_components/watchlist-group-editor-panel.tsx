'use client'

import { useCallback, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@v1/ui/button'
import { Input } from '@v1/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@v1/ui/tabs'
import { cn } from '@v1/ui/cn'
import { COLORS } from '@/components/color-picker'
import { AVAILABLE_ICONS, WatchlistGroupIcon } from '@/components/watchlist-group-icon'
import { DURATION_UI_S, EASE_OUT_CUBIC, motionDuration } from '@/lib/motion-tokens'

type PickerView = 'details' | 'icon'

interface WatchlistGroupEditorPanelProps {
  name: string
  icon: string
  color: string
  onNameChange: (name: string) => void
  onIconChange: (icon: string) => void
  onColorChange: (color: string) => void
  submitLabel: string
  onSubmit: () => void | Promise<void>
  cancelLabel?: string
  onCancel: () => void
  autoFocusName?: boolean
  className?: string
}

export function WatchlistGroupEditorPanel({
  name,
  icon,
  color,
  onNameChange,
  onIconChange,
  onColorChange,
  submitLabel,
  onSubmit,
  cancelLabel = 'Cancel',
  onCancel,
  autoFocusName = true,
  className,
}: WatchlistGroupEditorPanelProps) {
  const shouldReduceMotion = useReducedMotion()
  const [view, setView] = useState<PickerView>('details')

  const durationUi = motionDuration(shouldReduceMotion, DURATION_UI_S)
  const durationUiExit = motionDuration(shouldReduceMotion, DURATION_UI_S * 0.8)

  const handleSelectIcon = useCallback(
    (iconKey: string) => {
      onIconChange(iconKey)
      setView('details')
    },
    [onIconChange],
  )

  const handleCancel = useCallback(() => {
    setView('details')
    onCancel()
  }, [onCancel])

  return (
    <div
      className={cn(
        "ml-[-2px] w-auto overflow-hidden",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {view === 'details' ? (
          <motion.div
            key="details"
            initial={shouldReduceMotion ? false : { opacity: 0, x: -16 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    x: 16,
                    transition: { duration: durationUiExit, ease: EASE_OUT_CUBIC },
                  }
            }
            transition={{ duration: durationUi, ease: EASE_OUT_CUBIC }}
            className="space-y-6 px-1"
          >
            <div className="flex gap-2 items-start">
              <Button
                type="button"
                variant="outline"
                aria-label="Choose icon"
                onClick={() => setView('icon')}
                className="w-12 h-12 p-0 rounded-xl bg-transparent hover:bg-white/[0.05] border-zinc-200 dark:border-zinc-800"
              >
                <WatchlistGroupIcon icon={icon} size={20} />
              </Button>

              <div className="flex-1">
                <Input
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Watchlist name"
                  className="rounded-xl h-12"
                  autoFocus={autoFocusName}
                />
              </div>
            </div>

            <div className="grid grid-cols-6 gap-4 px-2">
              {COLORS.map((colorItem) => (
                <button
                  key={colorItem.value}
                  type="button"
                  className={cn(
                    "h-8 w-8 rounded-full cursor-pointer active:scale-[0.98] transition-transform duration-[var(--duration-micro)] ease-[var(--ease-out-cubic)] motion-reduce:transition-none border border-white/20",
                    colorItem.bg,
                    colorItem.border,
                    color === colorItem.value &&
                      "ring-2 ring-white/50 ring-offset-4 ring-offset-zinc-900",
                  )}
                  onClick={() => onColorChange(colorItem.value)}
                  aria-label={colorItem.name}
                />
              ))}
            </div>

            <div className="space-y-2">
              <Button onClick={() => void onSubmit()} size="sm" className="w-full h-10  rounded-full">
                {submitLabel}
              </Button>
              <Button
                onClick={handleCancel}
                variant="outline"
                size="sm"
                className="w-full h-10 rounded-full border-transparent bg-white/5 hover:bg-white/10"
              >
                {cancelLabel}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="icon"
            initial={shouldReduceMotion ? false : { opacity: 0, x: 16 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    x: -16,
                    transition: { duration: durationUiExit, ease: EASE_OUT_CUBIC },
                  }
            }
            transition={{ duration: durationUi, ease: EASE_OUT_CUBIC }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Back"
                onClick={() => setView('details')}
                className="h-8 w-8 p-0 rounded-lg hover:bg-white/5"
              >
                <ChevronLeft className="h-4 w-4 text-white/80" />
              </Button>
              <div className="text-sm font-semibold text-white/90">Choose icon</div>
            </div>

            <Tabs defaultValue="emojis" className="w-full">
              <TabsList className="w-full grid grid-cols-2 bg-zinc-950/40 rounded-xl p-1 border border-zinc-800">
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

              <TabsContent value="emojis" className="mt-3">
                <div className="grid grid-cols-6 gap-2 px-2">
                  {AVAILABLE_ICONS.emojis.map((emoji) => (
                    <Button
                      key={emoji.key}
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={emoji.label}
                      className={cn(
                        "h-10 w-10 p-0 rounded-lg hover:bg-white/[0.05]",
                        icon === emoji.key && "bg-zinc-800 ring-2 ring-white/20",
                      )}
                      onClick={() => handleSelectIcon(emoji.key)}
                      title={emoji.label}
                    >
                      <span style={{ fontSize: 20 }}>{emoji.emoji}</span>
                    </Button>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="icons" className="mt-3">
                <div className="grid grid-cols-6 gap-2 px-2">
                  {AVAILABLE_ICONS.icons.map((iconItem) => (
                    <Button
                      key={iconItem.key}
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={iconItem.label}
                      className={cn(
                        "h-10 w-10 p-0 rounded-lg hover:bg-white/[0.05]",
                        icon === iconItem.key && "ring-2 ring-white/20",
                      )}
                      onClick={() => handleSelectIcon(iconItem.key)}
                      title={iconItem.label}
                    >
                      <WatchlistGroupIcon icon={iconItem.key} size={20} className="text-white/80" />
                    </Button>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

