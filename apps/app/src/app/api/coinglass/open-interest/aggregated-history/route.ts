import { NextResponse } from "next/server";
import { z } from "zod";

const BASE_URL = "https://open-api-v4.coinglass.com/api";
const API_KEY = process.env.CG_API_KEY || process.env['CG-API-KEY'];

// Simple mapping for coin IDs to symbols
const COIN_ID_TO_SYMBOL: Record<number, string> = {
  1: 'BTC',
  1027: 'ETH',
  5426: 'SOL',
  52: 'XRP',
  74: 'DOGE',
  // Add more as needed
};

// Updated validation schema to handle both strings and numbers
const OpenInterestDataSchema = z.object({
  time: z.number(),
  open: z.union([z.string(), z.number()]), // Accept both string and number
  high: z.union([z.string(), z.number()]), // Accept both string and number
  low: z.union([z.string(), z.number()]),  // Accept both string and number
  close: z.union([z.string(), z.number()]), // Accept both string and number
});

const CoinglassOpenInterestResponseSchema = z.object({
  code: z.string(),
  msg: z.string().optional(),
  data: z.array(OpenInterestDataSchema),
});

export async function GET(request: Request) {
  try {
    // Check API key first
    if (!API_KEY) {
      console.error("CoinGlass API key not configured");
      return NextResponse.json(
        { error: 'CoinGlass API key not configured', success: false },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawSymbol = searchParams.get('symbol');
    const interval = searchParams.get('interval') || '12h';
    const unit = searchParams.get('unit') || 'usd';
    const limit = searchParams.get('limit') || '30';

    if (!rawSymbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required', success: false },
        { status: 400 }
      );
    }

    // Handle coin ID to symbol conversion
    let symbol = rawSymbol;
    let coinInfo = null;

    const coinId = Number.parseInt(rawSymbol);
    if (!Number.isNaN(coinId)) {
      const mappedSymbol = COIN_ID_TO_SYMBOL[coinId];
      if (mappedSymbol) {
        symbol = mappedSymbol;
        coinInfo = {
          coinId,
          symbol: mappedSymbol,
          name: 'Unknown',
          isSupported: true
        };
      } else {
        console.error("Coin ID not found in mapping:", coinId);
        return NextResponse.json(
          { 
            error: `Coin with ID ${coinId} not supported`,
            success: false,
            availableCoins: Object.keys(COIN_ID_TO_SYMBOL)
          },
          { status: 400 }
        );
      }
    }

    // Build API URL
    const apiUrl = `${BASE_URL}/futures/open-interest/aggregated-history?symbol=${symbol}&interval=${interval}&unit=${unit}&limit=${limit}`;

    // Make API request
    const response = await fetch(apiUrl, {
      headers: {
        'CG-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("CoinGlass API error:", response.status, errorText);
      return NextResponse.json(
        { 
          error: `CoinGlass API error: ${response.status}`,
          details: errorText,
          success: false 
        },
        { status: 500 }
      );
    }

    const data = await response.json();

    // Validate response
    const validatedData = CoinglassOpenInterestResponseSchema.parse(data);

    if (validatedData.code !== "0") {
      console.error("CoinGlass API returned error:", validatedData.msg);
      return NextResponse.json(
        { 
          error: `CoinGlass API error: ${validatedData.msg || 'Unknown error'}`,
          success: false 
        },
        { status: 500 }
      );
    }

    // Transform data - convert all values to numbers consistently
    const transformedData = validatedData.data.map(item => ({
      timestamp: item.time,
      open: typeof item.open === 'string' ? Number.parseFloat(item.open) : item.open,
      high: typeof item.high === 'string' ? Number.parseFloat(item.high) : item.high,
      low: typeof item.low === 'string' ? Number.parseFloat(item.low) : item.low,
      close: typeof item.close === 'string' ? Number.parseFloat(item.close) : item.close,
    }));

    return NextResponse.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
      symbol,
      interval,
      unit,
      originalInput: rawSymbol,
      coinInfo,
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Open interest route error:", error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown server error',
        success: false 
      },
      { status: 500 }
    );
  }
}