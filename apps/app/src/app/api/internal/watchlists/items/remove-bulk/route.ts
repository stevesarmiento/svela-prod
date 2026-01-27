import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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

export async function POST(req: NextRequest) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { coinIds?: string[]; groupId?: string };

  if (!Array.isArray(body.coinIds) || body.coinIds.length === 0) {
    return NextResponse.json({ error: "coinIds is required" }, { status: 400 });
  }

  const result = await convex.mutation(api.watchlists.removeBulkFromWatchlist, {
    serverToken: getServerToken(),
    clerkId,
    coinIds: body.coinIds,
    groupId: body.groupId as any,
  });

  return NextResponse.json(result);
}

