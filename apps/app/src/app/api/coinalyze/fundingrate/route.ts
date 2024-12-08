import { NextResponse } from 'next/server';
import { z } from 'zod';

const API_KEY = process.env.COINALYZE_API_KEY;
const BASE_URL = 'https://api.coinalyze.net';

const SymbolsSchema = z.object({
  symbols: z.string().min(1)
});

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
        revalidate: 60, // Cache for 1 minute
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
      const symbols = searchParams.get('symbols');
  
      if (!symbols) {
        return NextResponse.json(
          { error: 'Missing symbols parameter' },
          { status: 400 }
        );
      }
  
      console.log('Requesting funding rates for symbols:', symbols);
  
      const validatedParams = SymbolsSchema.parse({ symbols });
      
      const data = await fetchWithErrorHandling(
        `${BASE_URL}/funding_rate/v1/current?symbols=${encodeURIComponent(validatedParams.symbols)}`
      );
  
      // If we get here, we have data
      console.log('Coinalyze response:', data);
  
      // Return empty funding rates for unknown symbols instead of error
      return NextResponse.json(
        Object.fromEntries(
          symbols.split(',').map(symbol => [
            symbol,
            data[symbol] || { funding_rate: null }
          ])
        )
      );
  
    } catch (error) {
      console.error('Coinalyze route error:', error);
      
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid parameters', details: error.errors },
          { status: 400 }
        );
      }
  
      // Return partial data if possible instead of error
      return NextResponse.json(
        {},  // Return empty object instead of error
        { status: 200 } // Change to 200 to prevent client error
      );
    }
  }