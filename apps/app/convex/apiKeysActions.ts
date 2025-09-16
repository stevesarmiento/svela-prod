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
// TAG_LENGTH removed as it was unused

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

// Helper function to create display version of API key
function createDisplayKey(apiKey: string): string {
  if (apiKey.length <= 12) return apiKey;
  const start = apiKey.substring(0, 8);
  const end = apiKey.substring(apiKey.length - 4);
  return `${start}...${end}`;
}

// Server-side action to encrypt and store API key
export const addApiKeyWithEncryption = action({
  args: {
    clerkId: v.string(),
    provider: v.string(),
    keyName: v.string(),
    apiKey: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args): Promise<string> => {
    // Basic provider validation - just check it's one of the known providers
    const validProviders = ['coingecko', 'coinglass', 'openai', 'gemini'];
    if (!validProviders.includes(args.provider)) {
      throw new Error(`Invalid API provider: ${args.provider}`);
    }

    // Skip format validation - let the APIs themselves validate the keys
    // API key formats change over time and vary too much to reliably validate client-side

    // Create display version and encrypt the API key server-side
    const displayKey = createDisplayKey(args.apiKey);
    const encryptedKey = await encryptValue(args.apiKey);
    
    // Store in database via mutation
    // @ts-expect-error - internal API types may not be fully generated yet
    return await ctx.runMutation(internal.apiKeys.upsertApiKey, {
      clerkId: args.clerkId,
      provider: args.provider,
      keyName: args.keyName,
      encryptedKey,
      displayKey,
      isActive: args.isActive,
    });
  },
});
