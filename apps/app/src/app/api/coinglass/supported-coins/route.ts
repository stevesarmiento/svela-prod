import { ratelimit } from "@v1/kv/ratelimit";
import { NextResponse } from "next/server";
import { z } from "zod";

const BASE_URL = "https://open-api-v4.coinglass.com/api";
const API_KEY = process.env.CG_API_KEY;

// Validation schema for CoinGlass supported coins response
const CoinglassResponseSchema = z.object({
  code: z.string(),
  msg: z.string(),
  data: z.array(z.string()),
});

async function fetchWithErrorHandling(url: string) {
  if (!API_KEY) {
    return {
      ok: false,
      status: 503,
      statusText: 'CoinGlass API key not configured',
      json: async () => ({
        success: false,
        error: 'CoinGlass API key is not configured. Please set CG_API_KEY or CG-API-KEY in your environment.',
        data: []
      })
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        'CG_API_KEY': API_KEY,
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

    // Fetch supported coins from CoinGlass
    const response = await fetchWithErrorHandling(
      `${BASE_URL}/futures/supported-coins`
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