import { NextResponse } from 'next/server';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { slugToCoinalyzeSymbol, generateCoinalyzeSymbol } from '@/lib/coinalyze-mapper';

const API_KEY = process.env.COINALYZE_API_KEY;
const BASE_URL = 'https://api.coinalyze.net';
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function fetchWithErrorHandling(url: string) {
  if (!API_KEY) {
    throw new Error('Coinalyze API key is not configured');
  }

  try {
    const response = await fetch(url, {
      headers: {
        'api_key': API_KEY,
      },
      next: {
        revalidate: 300, // Cache for 5 minutes
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error("Coinalyze API error:", error);
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cmcId = searchParams.get('cmcId');

    if (!cmcId) {
      return NextResponse.json(
        { error: 'Missing cmcId parameter' },
        { status: 400 }
      );
    }

    // Get metadata from database
    const metadata = await convex.query(api.coins.getMetadataByCoinId, { 
      coinId: parseInt(cmcId) 
    });

    if (!metadata) {
      return NextResponse.json({
        longShortRatio: null,
        symbol: null,
        lastUpdate: null
      });
    }

    // Try hardcoded mapping first, then fallback to pattern
    let coinalyzeSymbol = slugToCoinalyzeSymbol(metadata.slug);
    
    if (!coinalyzeSymbol) {
      coinalyzeSymbol = generateCoinalyzeSymbol(metadata.symbol);
    }

    // Get data for the last 24 hours
    const now = Math.floor(Date.now() / 1000);
    const yesterday = now - (24 * 60 * 60);

    console.log('Long/Short Ratio - CMC ID:', cmcId, 'Slug:', metadata.slug, 'Symbol:', coinalyzeSymbol);

    const data = await fetchWithErrorHandling(
      `${BASE_URL}/v1/long-short-ratio-history?symbols=${encodeURIComponent(coinalyzeSymbol)}&interval=1hour&from=${yesterday}&to=${now}`
    );

    console.log('=== LONG/SHORT RATIO RAW API RESPONSE ===');
    console.log('URL:', `${BASE_URL}/v1/long-short-ratio-history?symbols=${encodeURIComponent(coinalyzeSymbol)}&interval=1hour&from=${yesterday}&to=${now}`);
    console.log('Raw response:', JSON.stringify(data, null, 2));
    console.log('Data type:', typeof data);
    console.log('Is array:', Array.isArray(data));
    console.log('Data length:', Array.isArray(data) ? data.length : 'N/A');
    if (Array.isArray(data) && data.length > 0) {
      console.log('First item:', JSON.stringify(data[0], null, 2));
      if (data[0].history) {
        console.log('History length:', data[0].history.length);
        console.log('Latest history item:', JSON.stringify(data[0].history[data[0].history.length - 1], null, 2));
      }
    }
    console.log('========================================');

    // API returns an array with symbol and history
    if (Array.isArray(data) && data.length > 0) {
      const symbolData = data[0];
      
      if (symbolData.history && symbolData.history.length > 0) {
        // Get the latest data point from history
        const latestData = symbolData.history[symbolData.history.length - 1];
        
        return NextResponse.json({
          longShortRatio: latestData.r, // 'r' is the ratio
          symbol: symbolData.symbol,
          lastUpdate: latestData.t, // 't' is the timestamp
          historical: symbolData.history // Include full history
        });
      }
    }

    // No data found
    return NextResponse.json({
      longShortRatio: null,
      symbol: coinalyzeSymbol,
      lastUpdate: null,
      historical: []
    });

  } catch (error) {
    console.error('Coinalyze long/short ratio route error:', error);
    
    // Return no data state instead of error
    return NextResponse.json({
      longShortRatio: null,
      symbol: null,
      lastUpdate: null,
      historical: []
    });
  }
}