import { redirect } from "next/navigation"

interface PageProps {
  params: Promise<{ locale: string; id: string }>
}

/**
 * Legacy route: token charts now live under the watchlists route so the
 * bottom nav keeps its highlighted context. Redirect old links/bookmarks.
 */
export default async function LegacyChartPage({ params }: PageProps) {
  const { id } = await params
  redirect(`/watchlists/${encodeURIComponent(id)}`)
}
