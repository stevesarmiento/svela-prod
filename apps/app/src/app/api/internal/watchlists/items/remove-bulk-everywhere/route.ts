import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../../../convex/_generated/api";
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

  const body = (await req.json()) as { coinIds?: string[] };

  if (!Array.isArray(body.coinIds) || body.coinIds.length === 0) {
    return NextResponse.json({ error: "coinIds is required" }, { status: 400 });
  }

  try {
    const result = await convex.mutation(api.watchlists.removeBulkFromAllWatchlists, {
      serverToken: getServerToken(),
      clerkId,
      coinIds: body.coinIds,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to remove watchlist items", details: message },
      { status: 500 },
    );
  }
}

