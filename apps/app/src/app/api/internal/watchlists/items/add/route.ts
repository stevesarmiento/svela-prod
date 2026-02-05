import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { convex, getServerToken } from "@/lib/convex-server";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(req: NextRequest) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { coinId?: string; groupId?: string };

  if (!body.coinId) {
    return NextResponse.json({ error: "coinId is required" }, { status: 400 });
  }

  try {
    const id = await convex.mutation(api.watchlists.addToWatchlist, {
      serverToken: getServerToken(),
      clerkId,
      coinId: body.coinId,
      groupId: body.groupId ? (body.groupId as Id<"watchlistGroups">) : undefined,
    });

    return NextResponse.json({ id });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "Watchlist group not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to add to watchlist", details: message },
      { status: 500 },
    );
  }
}

