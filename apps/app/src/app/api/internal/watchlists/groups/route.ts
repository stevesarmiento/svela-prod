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

export async function GET() {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groups = await convex.query(api.watchlists.getWatchlistGroups, {
    serverToken: getServerToken(),
    clerkId,
  });

  return NextResponse.json(groups);
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

  const id = await convex.mutation(api.watchlists.createWatchlistGroup, {
    serverToken: getServerToken(),
    clerkId,
    name: body.name.trim(),
    description: body.description,
    icon: body.icon,
    color: body.color,
  });

  return NextResponse.json({ id });
}

