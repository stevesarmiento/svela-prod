import { ConvexHttpClient } from "convex/browser"
import { env } from "@/env.mjs"

const convexUrl = env.NEXT_PUBLIC_CONVEX_URL
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured")

export const convex = new ConvexHttpClient(convexUrl)

export function getServerToken(): string {
  const token = env.INTERNAL_CONVEX_SERVER_TOKEN
  if (!token) throw new Error("INTERNAL_CONVEX_SERVER_TOKEN is not configured")
  return token
}

