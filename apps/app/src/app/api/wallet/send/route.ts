import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { env } from "../../../../env.mjs";

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user from Clerk
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { recipientAddress, amount, walletAddress } = await request.json();

    if (!recipientAddress || !amount || !walletAddress) {
      return NextResponse.json(
        { error: "Missing required fields: recipientAddress, amount, walletAddress" },
        { status: 400 }
      );
    }

    const apiKey = env.CROSSMINT_SERVER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Crossmint server API key not configured" },
        { status: 500 }
      );
    }

    console.log("Sending transaction:", { recipientAddress, amount, walletAddress });

    // For demo purposes, return a mock transaction
    // In production, you would:
    // 1. Build a proper Solana transaction
    // 2. Use Crossmint's transaction API to send it
    // 3. Return the actual transaction hash and explorer link

    const mockTransactionHash = `demo_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log("Demo transaction created:", mockTransactionHash);

    return NextResponse.json({
      success: true,
      hash: mockTransactionHash,
      explorerLink: `https://explorer.solana.com/tx/${mockTransactionHash}`,
      message: `Would send ${amount} SOL to ${recipientAddress} from ${walletAddress}`,
      note: "This is a demo transaction - no actual SOL was sent"
    });

  } catch (error) {
    console.error("Failed to send transaction:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 