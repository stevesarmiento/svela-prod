import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { API_PROVIDERS, type ApiProvider } from "@/constants/api-providers";
import { encryptValue } from "@/lib/encryption";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");

const convex = new ConvexHttpClient(convexUrl);

function getServerToken(): string {
  const token = process.env.INTERNAL_CONVEX_SERVER_TOKEN;
  if (!token) throw new Error("INTERNAL_CONVEX_SERVER_TOKEN is not configured");
  return token;
}

function createDisplayKey(apiKey: string): string {
  if (apiKey.length <= 12) return apiKey;
  const start = apiKey.substring(0, 8);
  const end = apiKey.substring(apiKey.length - 4);
  return `${start}...${end}`;
}

export async function GET() {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await convex.query(api.apiKeys.getUserApiKeys, {
    serverToken: getServerToken(),
    clerkId,
  });

  return NextResponse.json(keys);
}

export async function POST(req: NextRequest) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    provider?: ApiProvider;
    keyName?: string;
    apiKey?: string;
    isActive?: boolean;
  };

  if (!body.provider || !(body.provider in API_PROVIDERS)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!body.keyName?.trim()) {
    return NextResponse.json({ error: "keyName is required" }, { status: 400 });
  }
  if (!body.apiKey) {
    return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
  }

  const displayKey = createDisplayKey(body.apiKey);
  const encryptedKey = await encryptValue(body.apiKey);

  const id = await convex.mutation(api.apiKeys.upsertApiKey, {
    serverToken: getServerToken(),
    clerkId,
    provider: body.provider,
    keyName: body.keyName.trim(),
    encryptedKey,
    displayKey,
    isActive: body.isActive ?? true,
  });

  return NextResponse.json({ id });
}

