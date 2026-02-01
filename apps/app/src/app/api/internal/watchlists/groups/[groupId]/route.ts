import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { convex, getServerToken } from "@/lib/convex-server";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = await params;

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
  };

  try {
    await convex.mutation(api.watchlists.updateWatchlistGroup, {
      serverToken: getServerToken(),
      clerkId,
      groupId: groupId as Id<"watchlistGroups">,
      name: body.name,
      description: body.description,
      icon: body.icon,
      color: body.color,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "Watchlist group not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to update watchlist group", details: message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = await params;

  try {
    await convex.mutation(api.watchlists.deleteWatchlistGroup, {
      serverToken: getServerToken(),
      clerkId,
      groupId: groupId as Id<"watchlistGroups">,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "Watchlist group not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "Cannot delete default watchlist") {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to delete watchlist group", details: message },
      { status: 500 },
    );
  }
}

