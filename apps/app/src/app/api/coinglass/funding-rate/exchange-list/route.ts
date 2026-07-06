import { NextResponse } from "next/server";
import { withAuthRatelimit } from "@/lib/api/with-auth-ratelimit";
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

// Validation schema for funding rate data - make fields optional to handle incomplete data
const FundingRateItemSchema = z.object({
  exchange: z.string(),
  funding_rate_interval: z.number().optional(),
  funding_rate: z.number().optional(),
  next_funding_time: z.number().optional(),
});

const FundingRateDataSchema = z.object({
  symbol: z.string(),
  stablecoin_margin_list: z.array(FundingRateItemSchema),
  token_margin_list: z.array(FundingRateItemSchema),
});

const CoinglassFundingRateResponseSchema = z.object({
  code: z.string(),
  msg: z.string().optional(),
  data: z.array(FundingRateDataSchema),
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
        revalidate: 20, // Cache for 20 seconds (matches API update frequency)
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
    console.error("CoinGlass funding rate API error:", error);
    throw error;
  }
}

async function handleGet(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolOrId = searchParams.get('symbol') || 'BTC';

    let actualSymbol = symbolOrId;
    let coinInfo = null;

    // Check if the input is a number (coin ID) or a symbol
    const coinId = Number.parseInt(symbolOrId);
    if (!Number.isNaN(coinId)) {
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
    const apiUrl = `${BASE_URL}/futures/funding-rate/exchange-list?symbol=${actualSymbol}`;

    console.log('Fetching CoinGlass funding rate data:', {
      url: apiUrl,
      symbol: actualSymbol,
      originalInput: symbolOrId,
      coinInfo
    });

    // Fetch data from CoinGlass
    const response = await fetchWithErrorHandling(apiUrl);

    // Handle missing API key case
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({
        success: false,
        error: errorData.error,
        data: [],
        symbol: actualSymbol,
        originalInput: symbolOrId,
        coinInfo,
        lastUpdated: new Date().toISOString(),
      }, { status: 503 });
    }

    const data = await response.json();

    // Validate response structure
    const validatedData = CoinglassFundingRateResponseSchema.parse(data);

    if (validatedData.code !== "0") {
      throw new Error(`CoinGlass API error: ${validatedData.msg || 'Unknown error'}`);
    }

    // Transform data for our API response - filter out incomplete entries
    const transformedData = validatedData.data.map(item => ({
      symbol: item.symbol,
      stablecoinMarginList: item.stablecoin_margin_list
        .filter(rate => 
          rate.funding_rate_interval !== undefined && 
          rate.funding_rate !== undefined && 
          rate.next_funding_time !== undefined
        )
        .map(rate => ({
          exchange: rate.exchange,
          fundingRateInterval: rate.funding_rate_interval!,
          fundingRate: rate.funding_rate!,
          nextFundingTime: rate.next_funding_time!,
        })),
      tokenMarginList: item.token_margin_list
        .filter(rate => 
          rate.funding_rate_interval !== undefined && 
          rate.funding_rate !== undefined && 
          rate.next_funding_time !== undefined
        )
        .map(rate => ({
          exchange: rate.exchange,
          fundingRateInterval: rate.funding_rate_interval!,
          fundingRate: rate.funding_rate!,
          nextFundingTime: rate.next_funding_time!,
        })),
    }));

    return NextResponse.json({
      success: true,
      data: transformedData,
      symbol: actualSymbol,
      originalInput: symbolOrId,
      coinInfo,
      lastUpdated: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=10',
      },
    });

  } catch (error) {
    console.error('CoinGlass funding rate route error:', error);
    
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
        error: error instanceof Error ? error.message : "Failed to fetch funding rate data from CoinGlass",
        success: false 
      },
      { status: 500 }
    );
  }
}
export const GET = withAuthRatelimit(handleGet, {
  name: "coinglass-funding-rate",
});
