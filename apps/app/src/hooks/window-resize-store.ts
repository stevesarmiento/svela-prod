'use client'

type ResizeListener = () => void

const listeners: Set<ResizeListener> = new Set()

let isListening = false
let rafId: number | null = null

function notifyListeners(): void {
  if (rafId) return

  rafId = requestAnimationFrame(() => {
    rafId = null
    for (const listener of listeners) listener()
  })
}

export function subscribeToWindowResize(listener: ResizeListener): () => void {
  listeners.add(listener)

  if (!isListening) {
    isListening = true
    window.addEventListener('resize', notifyListeners, { passive: true })
  }

  return () => {
    listeners.delete(listener)

    if (listeners.size > 0) return

    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    window.removeEventListener('resize', notifyListeners)
    isListening = false
  }
}

