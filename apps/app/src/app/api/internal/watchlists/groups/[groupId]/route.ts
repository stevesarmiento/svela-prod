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

  await convex.mutation(api.watchlists.updateWatchlistGroup, {
    serverToken: getServerToken(),
    clerkId,
    groupId: groupId as any,
    name: body.name,
    description: body.description,
    icon: body.icon,
    color: body.color,
  });

  return NextResponse.json({ success: true });
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

  await convex.mutation(api.watchlists.deleteWatchlistGroup, {
    serverToken: getServerToken(),
    clerkId,
    groupId: groupId as any,
  });

  return NextResponse.json({ success: true });
}

