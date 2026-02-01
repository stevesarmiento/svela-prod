import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");

const convex = new ConvexHttpClient(convexUrl);

function getServerToken(): string {
  const token = process.env.INTERNAL_CONVEX_SERVER_TOKEN;
  if (!token) throw new Error("INTERNAL_CONVEX_SERVER_TOKEN is not configured");
  return token;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function redactSensitiveDetails(details: string): string {
  // Prevent leaking server-only secrets (e.g. INTERNAL_CONVEX_SERVER_TOKEN) back to the browser.
  return (
    details
      // `serverToken: "..."` (Convex schema mismatch error prints document contents)
      .replace(/serverToken:\s*"[^"]*"/g, 'serverToken: "[REDACTED]"')
      // JSON-style `"serverToken":"..."`
      .replace(/"serverToken"\s*:\s*"[^"]*"/g, '"serverToken":"[REDACTED]"')
  );
}

export async function GET() {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await convex.query(api.userSettings.getUserSettings, {
      serverToken: getServerToken(),
      clerkId,
    });

    return NextResponse.json(settings);
  } catch (error) {
    const message = redactSensitiveDetails(getErrorMessage(error));
    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to load user settings", details: message },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Partial<{
    memoryEnabled: boolean;
    autoCleanupEnabled: boolean;
    retentionDays: string;
    theme: string;
    currency: string;
    dateFormat: string;
    emailNotifications: boolean;
    pushNotifications: boolean;
    priceAlerts: boolean;
    analyticsEnabled: boolean;
    shareUsageData: boolean;
  }>;

  try {
    const id = await convex.mutation(api.userSettings.upsertUserSettings, {
      serverToken: getServerToken(),
      clerkId,
      memoryEnabled: body.memoryEnabled,
      autoCleanupEnabled: body.autoCleanupEnabled,
      retentionDays: body.retentionDays,
      theme: body.theme,
      currency: body.currency,
      dateFormat: body.dateFormat,
      emailNotifications: body.emailNotifications,
      pushNotifications: body.pushNotifications,
      priceAlerts: body.priceAlerts,
      analyticsEnabled: body.analyticsEnabled,
      shareUsageData: body.shareUsageData,
    });

    return NextResponse.json({ id });
  } catch (error) {
    const message = redactSensitiveDetails(getErrorMessage(error));
    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to update user settings", details: message },
      { status: 500 },
    );
  }
}

