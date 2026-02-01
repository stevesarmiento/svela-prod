import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { convex, getServerToken } from "@/lib/convex-server";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function GET(req: NextRequest) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = req.nextUrl.searchParams.get("groupId");

  if (groupId) {
    try {
      const items = await convex.query(api.watchlists.getWatchlistByGroup, {
        serverToken: getServerToken(),
        clerkId,
        groupId: groupId as Id<"watchlistGroups">,
      });
      return NextResponse.json(items);
    } catch (error) {
      const message = getErrorMessage(error);
      if (message === "Watchlist group not found") {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message === "User not found") {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Failed to load watchlist items", details: message },
        { status: 500 },
      );
    }
  }

  try {
    const items = await convex.query(api.watchlists.getWatchlist, {
      serverToken: getServerToken(),
      clerkId,
    });

    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load watchlist items", details: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

