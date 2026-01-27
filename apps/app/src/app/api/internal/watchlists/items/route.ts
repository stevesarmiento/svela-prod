import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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

export async function GET(req: NextRequest) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = req.nextUrl.searchParams.get("groupId");

  if (groupId) {
    const items = await convex.query(api.watchlists.getWatchlistByGroup, {
      serverToken: getServerToken(),
      clerkId,
      groupId: groupId as any,
    });
    return NextResponse.json(items);
  }

  const items = await convex.query(api.watchlists.getWatchlist, {
    serverToken: getServerToken(),
    clerkId,
  });

  return NextResponse.json(items);
}

