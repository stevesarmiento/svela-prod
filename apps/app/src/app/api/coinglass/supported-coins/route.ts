import { ratelimit } from "@v1/kv/ratelimit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { getUserApiKey } from "@/lib/user-api-keys";

const BASE_URL = "https://open-api-v4.coinglass.com/api";

// Validation schema for CoinGlass supported coins response
const CoinglassResponseSchema = z.object({
  code: z.string(),
  msg: z.string(),
  data: z.array(z.string()),
});

async function fetchWithErrorHandling(url: string, apiKey: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'CG_API_KEY': apiKey,
        'Content-Type': 'application/json',
      },
      next: {
        revalidate: 60, // Cache for 1 minute as per CoinGlass docs
      },
    });

    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.msg || `API error: ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error("CoinGlass API error:", error);
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const { success } = await ratelimit.limit(`${ip}-coinglass`);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }

    // Get user authentication for API key resolution
    const { userId: clerkId } = await auth();
    
    // Get API key - user's key takes precedence over environment variable
    const apiKeyResult = await getUserApiKey(clerkId, 'coinglass', 'CG_API_KEY');
    
    if (!apiKeyResult.key) {
      return NextResponse.json({
        success: false,
        error: 'CoinGlass API key not available. Please add your API key in settings or configure CG_API_KEY environment variable.',
        data: [],
        count: 0,
        lastUpdated: new Date().toISOString(),
      }, { status: 503 });
    }

    // Fetch supported coins from CoinGlass
    const response = await fetchWithErrorHandling(
      `${BASE_URL}/futures/supported-coins`,
      apiKeyResult.key
    );
    
    // Handle missing API key case
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({
        success: false,
        error: errorData.error,
        data: [],
        count: 0,
        lastUpdated: new Date().toISOString(),
      }, { status: 503 });
    }

    const data = await response.json();
    
    // Validate response structure
    const validatedData = CoinglassResponseSchema.parse(data);
    
    if (validatedData.code !== "0") {
      throw new Error(`CoinGlass API error: ${validatedData.msg}`);
    }

    return NextResponse.json({
      success: true,
      data: validatedData.data,
      count: validatedData.data.length,
      lastUpdated: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });

  } catch (error) {
    console.error("CoinGlass supported-coins route error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid API response format", details: error.errors },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Failed to fetch supported coins from CoinGlass",
        success: false 
      },
      { status: 500 }
    );
  }
}