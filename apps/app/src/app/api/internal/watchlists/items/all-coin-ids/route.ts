import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function GET(_req: NextRequest) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const coinIds = await convex.query(api.watchlists.getAllWatchlistCoinIds, {
      serverToken: getServerToken(),
      clerkId,
    });

    return NextResponse.json(coinIds);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load screener coin ids", details: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

