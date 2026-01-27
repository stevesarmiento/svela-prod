import { decryptValue } from "@/lib/encryption";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";
import { cache } from "react";

// Initialize Convex client for server-side usage
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const getActiveApiKeyCached = cache(async (clerkId: string, provider: string) => {
  return await convex.query(api.apiKeys.getActiveApiKey, {
    clerkId,
    provider,
  });
});

const decryptValueCached = cache(async (encryptedKey: string) => {
  return await decryptValue(encryptedKey);
});

export interface UserApiKeyResult {
  key: string | null;
  isUserKey: boolean;
  fallbackKey: string | null;
}

/**
 * Gets the API key for a user and provider, with fallback to environment variables
 * This function should be used in API routes to get the appropriate key
 */
export async function getUserApiKey(
  clerkId: string | null,
  provider: string,
  fallbackEnvVar?: string
): Promise<UserApiKeyResult> {
  let userKey: string | null = null;
  let isUserKey = false;

  // Try to get user's API key if they're authenticated
  if (clerkId) {
    try {
      const userApiKey = await getActiveApiKeyCached(clerkId, provider);

      if (userApiKey && userApiKey.encryptedKey) {
        try {
          userKey = await decryptValueCached(userApiKey.encryptedKey);
          isUserKey = true;
          
          // Update usage stats (fire and forget)
          convex.mutation(api.apiKeys.updateApiKeyStats, {
            keyId: userApiKey._id,
            usageCount: (userApiKey.usageCount || 0) + 1,
            lastValidated: Date.now(),
          }).catch(console.error);
          
        } catch (decryptionError) {
          console.error("Failed to decrypt user API key:", decryptionError);
          // Fall back to environment key
        }
      }
    } catch (error) {
      console.error("Error fetching user API key:", error);
      // Fall back to environment key
    }
  }

  // Fallback to environment variable
  const fallbackKey = fallbackEnvVar ? process.env[fallbackEnvVar] || null : null;

  return {
    key: userKey || fallbackKey,
    isUserKey,
    fallbackKey,
  };
}

/**
 * Middleware wrapper for API routes that need API key resolution
 * Usage: const apiKey = await withApiKey(clerkId, 'coingecko', 'X_CG_PRO_API_KEY');
 */
export async function withApiKey(
  clerkId: string | null,
  provider: string,
  fallbackEnvVar?: string
): Promise<string> {
  const result = await getUserApiKey(clerkId, provider, fallbackEnvVar);
  
  if (!result.key) {
    throw new Error(`No API key available for provider: ${provider}`);
  }
  
  return result.key;
}

/**
 * Get multiple API keys at once for efficiency
 */
export async function getUserApiKeys(
  clerkId: string | null,
  providers: Array<{ provider: string; fallbackEnvVar?: string }>
): Promise<Record<string, UserApiKeyResult>> {
  const results: Record<string, UserApiKeyResult> = {};
  
  // Fetch all user keys in parallel
  const promises = providers.map(async ({ provider, fallbackEnvVar }) => {
    const result = await getUserApiKey(clerkId, provider, fallbackEnvVar);
    return { provider, result };
  });
  
  const resolvedResults = await Promise.all(promises);
  
  for (const { provider, result } of resolvedResults) {
    results[provider] = result;
  }
  
  return results;
}

/**
 * Update rate limiting information for a user's API key
 */
export async function updateUserApiKeyRateLimit(
  clerkId: string | null,
  provider: string,
  rateLimitRemaining: number,
  rateLimitReset: number
): Promise<void> {
  if (!clerkId) return;
  
  try {
    const userApiKey = await getActiveApiKeyCached(clerkId, provider);

    if (userApiKey) {
      await convex.mutation(api.apiKeys.updateApiKeyStats, {
        keyId: userApiKey._id,
        rateLimitRemaining,
        rateLimitReset,
      });
    }
  } catch (error) {
    console.error("Error updating rate limit info:", error);
  }
}

/**
 * Report API key validation error
 */
export async function reportApiKeyError(
  clerkId: string | null,
  provider: string,
  error: string
): Promise<void> {
  if (!clerkId) return;
  
  try {
    const userApiKey = await getActiveApiKeyCached(clerkId, provider);

    if (userApiKey) {
      await convex.mutation(api.apiKeys.updateApiKeyStats, {
        keyId: userApiKey._id,
        validationError: error,
      });
    }
  } catch (err) {
    console.error("Error reporting API key error:", err);
  }
}

/**
 * Headers helper for different API providers
 */
export function getApiHeaders(provider: string, apiKey: string): Record<string, string> {
  const baseHeaders = {
    'Content-Type': 'application/json',
  };

  switch (provider) {
    case 'coingecko':
      return {
        ...baseHeaders,
        'x-cg-pro-api-key': apiKey,
      };
    
    case 'coinglass':
      return {
        ...baseHeaders,
        'CG-API-KEY': apiKey,
      };
    
    case 'openai':
      return {
        ...baseHeaders,
        'Authorization': `Bearer ${apiKey}`,
      };
    
    case 'gemini':
      return {
        ...baseHeaders,
        'x-goog-api-key': apiKey,
      };
    
    // coinmarketcap removed - no longer supported
    
    default:
      return {
        ...baseHeaders,
        'Authorization': `Bearer ${apiKey}`,
      };
  }
}
