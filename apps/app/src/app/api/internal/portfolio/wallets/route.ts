import { NextResponse, type NextRequest } from "next/server";
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
    const wallets = await convex.query(api.portfolio.listPortfolioWallets, {
      serverToken: getServerToken(),
      clerkId,
    });
    return NextResponse.json(wallets);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load portfolio wallets", details: getErrorMessage(error) },
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

  const body = (await req.json()) as { address?: string; name?: string };
  const address = body.address?.trim();

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const id = await convex.mutation(api.portfolio.addPortfolioWallet, {
      serverToken: getServerToken(),
      clerkId,
      address,
      name: body.name?.trim() || undefined,
    });
    return NextResponse.json({ id });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "Invalid wallet address") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to add portfolio wallet", details: message },
      { status: 500 },
    );
  }
}

