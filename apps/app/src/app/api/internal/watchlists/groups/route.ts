import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function GET() {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const groups = await convex.query(api.watchlists.getWatchlistGroups, {
      serverToken: getServerToken(),
      clerkId,
    });
    return NextResponse.json(groups);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load watchlist groups", details: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const id = await convex.mutation(api.watchlists.createWatchlistGroup, {
      serverToken: getServerToken(),
      clerkId,
      name: body.name.trim(),
      description: body.description,
      icon: body.icon,
      color: body.color,
    });

    return NextResponse.json({ id });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to create watchlist group", details: message },
      { status: 500 },
    );
  }
}

