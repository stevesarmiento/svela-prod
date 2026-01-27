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

export async function GET() {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await convex.query(api.userSettings.getUserSettings, {
    serverToken: getServerToken(),
    clerkId,
  });

  return NextResponse.json(settings);
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
}

