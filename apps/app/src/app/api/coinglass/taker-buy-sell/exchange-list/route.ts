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
};

// Validation schema for exchange data
const ExchangeDataSchema = z.object({
  exchange: z.string(),
  buy_ratio: z.number(),
  sell_ratio: z.number(),
  buy_vol_usd: z.number(),
  sell_vol_usd: z.number(),
});

const TakerBuySellDataSchema = z.object({
  symbol: z.string(),
  buy_ratio: z.number(),
  sell_ratio: z.number(),
  buy_vol_usd: z.number(),
  sell_vol_usd: z.number(),
  exchange_list: z.array(ExchangeDataSchema),
});

const CoinglassTakerBuySellResponseSchema = z.object({
  code: z.string(),
  msg: z.string().optional(),
  data: TakerBuySellDataSchema,
});

export async function GET(request: Request) {
  try {
    console.log('=== Taker Buy/Sell API Route Start ===');
    
    // Check API key first
    if (!API_KEY) {
      console.error('❌ CoinGlass API key not configured');
      return NextResponse.json(
        { error: 'CoinGlass API key not configured', success: false },
        { status: 500 }
      );
    }
    console.log('✅ API key found, length:', API_KEY.length);

    const { searchParams } = new URL(request.url);
    const rawSymbol = searchParams.get('symbol');
    const range = searchParams.get('range') || '24h'; // Default to 24h for daily pressure

    console.log('📊 Request params:', { rawSymbol, range });

    if (!rawSymbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required', success: false },
        { status: 400 }
      );
    }

    // Handle coin ID to symbol conversion
    let symbol = rawSymbol;
    let coinInfo = null;

    const coinId = parseInt(rawSymbol);
    if (!isNaN(coinId)) {
      const mappedSymbol = COIN_ID_TO_SYMBOL[coinId];
      if (mappedSymbol) {
        symbol = mappedSymbol;
        coinInfo = {
          coinId,
          symbol: mappedSymbol,
          name: 'Unknown',
          isSupported: true
        };
        console.log('✅ Mapped coin ID', coinId, 'to symbol', mappedSymbol);
      } else {
        console.error('❌ Coin ID not found in mapping:', coinId);
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
    const apiUrl = `${BASE_URL}/futures/taker-buy-sell-volume/exchange-list?symbol=${symbol}&range=${range}`;
    console.log('🌐 Calling CoinGlass API:', apiUrl);

    // Make API request
    const response = await fetch(apiUrl, {
      headers: {
        'CG-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
    });

    console.log('📡 CoinGlass response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ CoinGlass API error:', response.status, errorText);
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
    console.log('📊 CoinGlass response:', { 
      code: data.code, 
      msg: data.msg,
      symbol: data.data?.symbol,
      exchangeCount: data.data?.exchange_list?.length
    });

    // Validate response
    const validatedData = CoinglassTakerBuySellResponseSchema.parse(data);

    if (validatedData.code !== "0") {
      console.error('❌ CoinGlass API returned error:', validatedData.msg);
      return NextResponse.json(
        { 
          error: `CoinGlass API error: ${validatedData.msg || 'Unknown error'}`,
          success: false 
        },
        { status: 500 }
      );
    }

    // Transform data for frontend consumption
    const transformedData = {
      symbol: validatedData.data.symbol,
      overall: {
        buyRatio: validatedData.data.buy_ratio,
        sellRatio: validatedData.data.sell_ratio,
        buyVolumeUsd: validatedData.data.buy_vol_usd,
        sellVolumeUsd: validatedData.data.sell_vol_usd,
        totalVolumeUsd: validatedData.data.buy_vol_usd + validatedData.data.sell_vol_usd,
      },
      exchanges: validatedData.data.exchange_list.map(exchange => ({
        exchange: exchange.exchange,
        buyRatio: exchange.buy_ratio,
        sellRatio: exchange.sell_ratio,
        buyVolumeUsd: exchange.buy_vol_usd,
        sellVolumeUsd: exchange.sell_vol_usd,
        totalVolumeUsd: exchange.buy_vol_usd + exchange.sell_vol_usd,
      })),
    };

    console.log('✅ Successfully processed taker buy/sell data');

    return NextResponse.json({
      success: true,
      data: transformedData,
      range,
      symbol,
      originalInput: rawSymbol,
      coinInfo,
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Taker Buy/Sell Route Error:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown server error',
        success: false 
      },
      { status: 500 }
    );
  }
}