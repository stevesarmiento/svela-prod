import { NextRequest, NextResponse } from "next/server";
import { env } from "../../../../env.mjs";

export async function POST(request: NextRequest) {
  try {
    const { userId, userEmail, chain = "solana" } = await request.json();

    if (!userId || !userEmail) {
      return NextResponse.json(
        { error: "Missing userId or userEmail" },
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

    console.log("Creating wallet via REST API for:", userEmail);

    // Determine wallet type based on chain
    let walletType;
    if (chain === "solana") {
      walletType = "solana-custodial-wallet"; // Most straightforward option for basic usage
    } else if (chain === "ethereum" || chain === "polygon") {
      walletType = "evm-smart-wallet";
    } else {
      return NextResponse.json(
        { error: `Unsupported chain: ${chain}` },
        { status: 400 }
      );
    }

    // Use Crossmint REST API to create wallet
    const response = await fetch("https://staging.crossmint.com/api/v1-alpha2/wallets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        type: walletType,
        linkedUser: `email:${userEmail}`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Crossmint API Error:", response.status, errorText);
      return NextResponse.json(
        { error: `Crossmint API error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const wallet = await response.json();
    console.log("Wallet created successfully via REST API:", wallet);

    return NextResponse.json({ wallet });
  } catch (error) {
    console.error("Failed to create wallet:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 