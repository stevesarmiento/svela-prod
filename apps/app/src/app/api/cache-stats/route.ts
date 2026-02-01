import { NextResponse } from "next/server"
import { CacheQueue } from "@/lib/effect/cache-queue"
import { runPromise } from "@/lib/effect/runtime-server"

export async function GET() {
  try {
    const stats = await runPromise(CacheQueue.getStats())
    return NextResponse.json({ stats })
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to get stats',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

