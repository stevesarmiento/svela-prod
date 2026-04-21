'use client'

import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import {
  extractChartCoinId,
  isDashboardPrefetchPath,
  prefetchChartRoute,
  prefetchDashboardRoute,
} from "@/lib/prefetch-routes"

export function LinkIntentPrefetch() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const seen = useRef(new Set<string>())

  useEffect(() => {
    const handleTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return

      const anchor = target.closest("a[href]") as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.dataset.prefetch === "false") return

      const rawHref = anchor.getAttribute("href")
      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:")) return

      const url = new URL(rawHref, window.location.origin)
      if (url.origin !== window.location.origin) return

      const key = `${url.pathname}${url.search}`
      if (seen.current.has(key)) return
      seen.current.add(key)

      const coinId = extractChartCoinId(url.pathname)
      if (coinId) {
        void prefetchChartRoute({
          router,
          queryClient,
          coinId,
          href: key,
        })
        return
      }

      if (isDashboardPrefetchPath(url.pathname)) {
        prefetchDashboardRoute(router, key)
      }
    }

    const handleMouseOver = (event: MouseEvent) => {
      handleTarget(event.target)
    }

    const handleFocusIn = (event: FocusEvent) => {
      handleTarget(event.target)
    }

    document.addEventListener("mouseover", handleMouseOver, { passive: true })
    document.addEventListener("focusin", handleFocusIn)

    return () => {
      document.removeEventListener("mouseover", handleMouseOver)
      document.removeEventListener("focusin", handleFocusIn)
    }
  }, [queryClient, router])

  return null
}
