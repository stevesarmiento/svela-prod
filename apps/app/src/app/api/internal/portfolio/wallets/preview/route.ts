import { NextResponse, type NextRequest } from "next/server";
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

  const body = (await req.json()) as { address?: string };
  const address = body.address?.trim();

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const result = await convex.action(api.portfolio.previewPortfolioWalletCandidates, {
      serverToken: getServerToken(),
      walletAddress: address,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === "Invalid wallet address") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to preview wallet tokens", details: message },
      { status: 500 },
    );
  }
}

