import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ walletId: string }> },
) {
  const authResult = await auth();
  const clerkId = authResult.userId;

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { walletId } = await context.params;
  const trimmed = walletId?.trim();

  if (!trimmed) {
    return NextResponse.json({ error: "walletId is required" }, { status: 400 });
  }

  try {
    await convex.mutation(api.portfolio.deletePortfolioWallet, {
      serverToken: getServerToken(),
      clerkId,
      walletId: trimmed as never,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: "Failed to delete wallet", details: message }, { status: 500 });
  }
}

