import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
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

/**
 * Ensure the authenticated Clerk user exists in Convex `users`.
 * Idempotent: safe to call multiple times.
 */
export async function POST() {
  try {
    const [authResult, user] = await Promise.all([auth(), currentUser()]);

    if (!authResult.userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let serverToken: string;
    try {
      serverToken = getServerToken();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Server misconfigured";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const email = user.emailAddresses[0]?.emailAddress ?? "";

    await convex.mutation(api.users.createUser, {
      serverToken,
      clerkId: user.id,
      email,
      fullName: user.fullName ?? undefined,
      avatarUrl: user.imageUrl ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "User sync failed";

    // Help diagnose missing/mismatched Convex env without leaking secrets.
    if (message.includes("Missing INTERNAL_CONVEX_SERVER_TOKEN")) {
      return NextResponse.json(
        { error: "Convex INTERNAL_CONVEX_SERVER_TOKEN is not configured" },
        { status: 500 },
      );
    }
    if (message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Convex server token mismatch (Unauthorized)" },
        { status: 500 },
      );
    }

    console.error("[api/internal/users/sync] failed", error);
    return NextResponse.json({ error: "User sync failed" }, { status: 500 });
  }
}

