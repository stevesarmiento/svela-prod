import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { NextRequest, NextResponse } from "next/server";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 20 } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query parameter is required" }, { status: 400 });
    }

    const coins = await convex.query(api.coins.searchCoins, { 
      query: query.toString(),
      limit: Number(limit)
    });

    return NextResponse.json(coins);
  } catch (error) {
    console.error("Error searching coins:", error);
    return NextResponse.json(
      { error: "Failed to search coins" },
      { status: 500 }
    );
  }
} 