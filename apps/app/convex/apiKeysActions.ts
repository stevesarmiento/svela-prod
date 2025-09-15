"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createCipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

// Convert scrypt to promise-based
const asyncScrypt = promisify(scrypt);

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

// Generate a secret key from environment or use a default for development
const MASTER_KEY = process.env.API_ENCRYPTION_KEY || 'dev-key-change-in-production-32-bytes';

/**
 * Derives an encryption key from the master key and salt
 */
async function deriveKey(salt: Buffer): Promise<Buffer> {
  return (await asyncScrypt(MASTER_KEY, salt, KEY_LENGTH)) as Buffer;
}

/**
 * Encrypts a string value using AES-256-GCM
 */
async function encryptValue(plaintext: string): Promise<string> {
  try {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = await deriveKey(salt);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([salt, iv, tag, encrypted]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt API key');
  }
}

// API Provider configurations (copied from apiKeys.ts)
const API_PROVIDERS = {
  coingecko: {
    name: "CoinGecko Pro",
    keyPattern: /^CG-[A-Za-z0-9\-]{20,}$/,
  },
  coinglass: {
    name: "CoinGlass", 
    keyPattern: /^[A-Za-z0-9]{32,}$/,
  },
  openai: {
    name: "OpenAI",
    keyPattern: /^sk-[A-Za-z0-9]{48,}$/,
  },
  gemini: {
    name: "Google Gemini",
    keyPattern: /^[A-Za-z0-9]{39}$/,
  },
  coinmarketcap: {
    name: "CoinMarketCap",
    keyPattern: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  },
} as const;

// Server-side action to encrypt and store API key
export const addApiKeyWithEncryption = action({
  args: {
    clerkId: v.string(),
    provider: v.string(),
    keyName: v.string(),
    apiKey: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args): Promise<any> => {
    // Validate provider
    if (!(args.provider in API_PROVIDERS)) {
      throw new Error(`Invalid API provider: ${args.provider}`);
    }

    const providerConfig = API_PROVIDERS[args.provider as keyof typeof API_PROVIDERS];
    
    // Validate API key format
    if (!providerConfig.keyPattern.test(args.apiKey)) {
      throw new Error(`Invalid ${providerConfig.name} API key format`);
    }

    // Encrypt the API key server-side
    const encryptedKey = await encryptValue(args.apiKey);
    
    // Store in database via mutation
    // @ts-ignore - internal API types may not be fully generated yet
    return await ctx.runMutation(internal.apiKeys.upsertApiKey, {
      clerkId: args.clerkId,
      provider: args.provider,
      keyName: args.keyName,
      encryptedKey,
      isActive: args.isActive,
    });
  },
});
