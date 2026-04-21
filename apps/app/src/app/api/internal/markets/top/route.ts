import { type NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");

const convex = new ConvexHttpClient(convexUrl);

function getServerToken(): string {
  const token = process.env.INTERNAL_CONVEX_SERVER_TOKEN;
  if (!token) throw new Error("INTERNAL_CONVEX_SERVER_TOKEN is not configured");
  return token;
}

function parseLimit(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get("limit");
  if (!raw) return 250;
  const limit = Number(raw);
  if (!Number.isFinite(limit)) return 250;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

export async function GET(req: NextRequest) {
  const limit = parseLimit(req);

  const rows = await convex.query(api.coingeckoMarkets.getTopMarketDataByRank, {
    serverToken: getServerToken(),
    limit,
  });

  return NextResponse.json(rows, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600",
    },
  });
}
