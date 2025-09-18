import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { API_PROVIDERS, type ApiProvider } from "@/../convex/apiKeys";
import { getApiHeaders } from "@/lib/user-api-keys";
import { ratelimit } from "@v1/kv/ratelimit";

/**
 * Validates an API key by making a test request to the provider's API
 * This endpoint is used by the frontend to validate keys before saving
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const rateLimitResult = await ratelimit.limit(`${ip}-validate-api-key`);
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests" }, 
        { status: 429 }
      );
    }

    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { provider, apiKey } = body;

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "Provider and API key are required" }, 
        { status: 400 }
      );
    }

    if (!(provider in API_PROVIDERS)) {
      return NextResponse.json(
        { error: "Invalid provider" }, 
        { status: 400 }
      );
    }

    const providerConfig = API_PROVIDERS[provider as ApiProvider];
    
    // Basic format validation
    if (!providerConfig.keyPattern.test(apiKey)) {
      return NextResponse.json(
        { 
          isValid: false, 
          error: "Invalid API key format",
          expectedFormat: getExpectedFormat(provider)
        }, 
        { status: 200 }
      );
    }

    // Test the API key with a lightweight endpoint
    const validationResult = await validateApiKeyWithProvider(provider, apiKey);
    
    return NextResponse.json(validationResult, { status: 200 });

  } catch (error) {
    console.error("API key validation error:", error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}

/**
 * Validate API key by making a test request to the provider
 */
async function validateApiKeyWithProvider(
  provider: string, 
  apiKey: string
): Promise<{ isValid: boolean; error?: string; details?: object }> {
  const headers = getApiHeaders(provider, apiKey);
  const timeout = 10000; // 10 second timeout

  try {
    let testUrl: string;

    switch (provider) {
      case 'coingecko':
        testUrl = 'https://pro-api.coingecko.com/api/v3/ping';
        break;
        
      case 'coinglass':
        testUrl = 'https://fapi.coinglass.com/api/futures/supported-coins';
        break;
        
      case 'openai':
        testUrl = 'https://api.openai.com/v1/models';
        break;
        
      case 'gemini':
        testUrl = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;
        // For Gemini, we pass the key as a query param instead of header
        delete headers['x-goog-api-key'];
        break;
        
      // coinmarketcap removed - no longer supported
        
      default:
        return { isValid: false, error: "Unsupported provider for validation" };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(testUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { 
        isValid: true, 
        details: {
          status: response.status,
          provider: provider,
          timestamp: Date.now(),
        }
      };
    } else {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      // Parse provider-specific error messages
      try {
        const errorData = JSON.parse(errorText);
        if (provider === 'coingecko' && errorData.error) {
          errorMessage = errorData.error;
        } else if (provider === 'openai' && errorData.error?.message) {
          errorMessage = errorData.error.message;
        // coinmarketcap error handling removed
        }
      } catch {
        // Use generic error message if parsing fails
      }

      return { 
        isValid: false, 
        error: errorMessage,
        details: {
          status: response.status,
          provider: provider,
          timestamp: Date.now(),
        }
      };
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { isValid: false, error: "Request timeout - API endpoint unreachable" };
      }
      return { isValid: false, error: error.message };
    }
    
    return { isValid: false, error: "Unknown validation error" };
  }
}

/**
 * Get expected format string for user guidance
 */
function getExpectedFormat(provider: string): string {
  switch (provider) {
    case 'coingecko':
      return 'CG-xxxxxxxxxxxxxxxx... (starts with CG-, min 23 chars total)';
    case 'openai':
      return 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (starts with sk-)';
    case 'gemini':
      return '39 character alphanumeric string';
    // coinmarketcap removed
    case 'coinglass':
      return '32+ character alphanumeric string';
    default:
      return 'Check provider documentation for format';
  }
}
