import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../../convex/_generated/dataModel";
import { convex, getServerToken } from "@/lib/convex-server";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> },
) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { walletId } = await params;

  try {
    const coinIds = await convex.query(api.portfolio.getPortfolioWalletCoinIds, {
      serverToken: getServerToken(),
      clerkId,
      walletId: walletId as Id<"portfolioWallets">,
    });
    return NextResponse.json({ coinIds });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load portfolio wallet coin ids", details: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

