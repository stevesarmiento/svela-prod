'use client'

import { useEffect } from "react"

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    const register = () => {
      void navigator.serviceWorker.register("/sw.js")
    }

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(register, { timeout: 2_000 })
      return
    }

    const timer = setTimeout(register, 300)
    return () => clearTimeout(timer)
  }, [])

  return null
}
