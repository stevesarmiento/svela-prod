import { NextResponse } from "next/server";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";

const BASE_URL = "https://open-api-v4.coinglass.com/api";
const API_KEY = process.env.CG_API_KEY || process.env['CG-API-KEY'];
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function getServerToken(): string {
  const token = process.env.INTERNAL_CONVEX_SERVER_TOKEN;
  if (!token) throw new Error("INTERNAL_CONVEX_SERVER_TOKEN is not configured");
  return token;
}

// Validation schema for CoinGlass liquidation aggregated history response
const LiquidationDataSchema = z.object({
  time: z.number(),
  aggregated_long_liquidation_usd: z.number(),
  aggregated_short_liquidation_usd: z.number(),
});

const CoinglassLiquidationResponseSchema = z.object({
  code: z.string(),
  msg: z.string().optional(),
  data: z.array(LiquidationDataSchema),
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
        data: [],
        count: 0
      })
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        'CG-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
      next: {
        revalidate: 300, // Cache for 5 minutes
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
    const { searchParams } = new URL(request.url);
    const symbolOrId = searchParams.get('symbol') || 'BTC';
    const interval = searchParams.get('interval') || '1d';
    const exchangeList = searchParams.get('exchange_list') || 'Binance';
    const limit = parseInt(searchParams.get('limit') || '30');
    const startTime = searchParams.get('start_time');
    const endTime = searchParams.get('end_time');

    let actualSymbol = symbolOrId;
    let coinInfo = null;

    // Check if the input is a number (coin ID) or a symbol
    const coinId = parseInt(symbolOrId);
    if (!isNaN(coinId)) {
      // It's a coin ID, look up the symbol
      coinInfo = await convex.query(api.coins.getCoinglassSymbolByCoinId, { 
        serverToken: getServerToken(),
        coinId 
      });
      
      if (!coinInfo) {
        // Get list of supported coins for error message
        const supportedCoins = await convex.query(api.coins.getCoinglassSupportedCoinsList, {
          serverToken: getServerToken(),
        });
        
        return NextResponse.json({
          success: false,
          error: `Coin with ID ${coinId} not found or not supported by CoinGlass`,
          supportedCoins: supportedCoins.slice(0, 10), // Just first 10 for brevity
          coinId
        }, { status: 400 });
      }
      
      actualSymbol = coinInfo.symbol;
    } else {
      // It's a symbol, check if it's supported
      const symbol = symbolOrId.toUpperCase();
      const isSupportedPromise = convex.query(api.coins.isCoinglassSupported, {
        serverToken: getServerToken(),
        symbol,
      });
      const coinPromise = convex.query(api.coins.getCoinBySymbol, {
        serverToken: getServerToken(),
        symbol,
      });
      const isSupported = await isSupportedPromise;
      
      if (!isSupported) {
        return NextResponse.json({
          success: false,
          error: `Symbol ${symbolOrId} is not supported by CoinGlass`,
          inputSymbol: symbolOrId
        }, { status: 400 });
      }
      
      actualSymbol = symbol;
      
      // Get coin info for response
      const coin = await coinPromise;
      
      if (coin) {
        coinInfo = {
          symbol: actualSymbol,
          name: coin.name,
          coinId: coin.coinId,
          isSupported: true
        };
      }
    }

    // Build URL with validated symbol
    let apiUrl = `${BASE_URL}/futures/liquidation/aggregated-history?symbol=${actualSymbol}&interval=${interval}&exchange_list=${encodeURIComponent(exchangeList)}&limit=${limit}`;
    
    if (startTime) {
      apiUrl += `&start_time=${startTime}`;
    }
    if (endTime) {
      apiUrl += `&end_time=${endTime}`;
    }

    console.log('Fetching CoinGlass liquidation data:', {
      url: apiUrl,
      symbol: actualSymbol,
      originalInput: symbolOrId,
      coinInfo
    });

    // Fetch liquidation data from CoinGlass
    const response = await fetchWithErrorHandling(apiUrl);
    
    // Handle missing API key case
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({
        success: false,
        error: errorData.error,
        data: [],
        count: 0,
        symbol: actualSymbol,
        originalInput: symbolOrId,
        coinInfo,
        interval,
        exchangeList,
        lastUpdated: new Date().toISOString(),
      }, { status: 503 });
    }
    
    const data = await response.json();
    
    // Validate response structure
    const validatedData = CoinglassLiquidationResponseSchema.parse(data);
    
    if (validatedData.code !== "0") {
      throw new Error(`CoinGlass API error: ${validatedData.msg || 'Unknown error'}`);
    }

    // Transform data for easier consumption
    const transformedData = validatedData.data.map(item => ({
      timestamp: item.time,
      date: new Date(item.time).toISOString(),
      longLiquidations: item.aggregated_long_liquidation_usd,
      shortLiquidations: item.aggregated_short_liquidation_usd,
      totalLiquidations: item.aggregated_long_liquidation_usd + item.aggregated_short_liquidation_usd,
    }));

    return NextResponse.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
      symbol: actualSymbol,
      originalInput: symbolOrId,
      coinInfo,
      interval,
      exchangeList,
      lastUpdated: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });

  } catch (error) {
    console.error("CoinGlass liquidation API error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: "Invalid API response format", 
          details: error.errors,
          success: false 
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Failed to fetch liquidation data from CoinGlass",
        success: false 
      },
      { status: 500 }
    );
  }
}