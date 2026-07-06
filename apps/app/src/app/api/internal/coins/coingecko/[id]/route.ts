import { type NextRequest, NextResponse } from "next/server";
import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");

const convex = new ConvexHttpClient(convexUrl);

function getServerToken(): string {
  const token = process.env.INTERNAL_CONVEX_SERVER_TOKEN;
  if (!token) throw new Error("INTERNAL_CONVEX_SERVER_TOKEN is not configured");
  return token;
}

async function handleGet(_req: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const { id } = await params;
  const coin = await convex.query(api.coins.getCoinGeckoCoinById, {
    serverToken: getServerToken(),
    coingeckoId: id,
  });

  return NextResponse.json(coin);
}


export const GET = withAuthRatelimit(handleGet, {
  name: "internal-coin-by-id",
});
