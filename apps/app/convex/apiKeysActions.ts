"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { API_PROVIDERS } from "./apiKeys";
import type { Id } from "./_generated/dataModel";
import { createCipheriv, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { requireServerToken } from "./_lib/server_token";

// Convert scrypt to promise-based
const asyncScrypt = promisify(scrypt);

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
// TAG_LENGTH removed as it was unused

/**
 * Validates and returns the API encryption key from environment variables
 * Fails fast on startup if key is missing or invalid in production
 */
function validateAndGetEncryptionKey(): string {
  const apiKey = process.env.API_ENCRYPTION_KEY;
  
  // In production, API_ENCRYPTION_KEY is required
  if (process.env.NODE_ENV === 'production') {
    if (!apiKey) {
      throw new Error(
        'FATAL: API_ENCRYPTION_KEY environment variable is required in production but not set. Service startup failed.'
      );
    }
  }
  
  // If no key provided at all (dev or prod), fail
  if (!apiKey) {
    throw new Error(
      'FATAL: API_ENCRYPTION_KEY environment variable is required but not set. Service startup failed.'
    );
  }
  
  // Validate key format and length (must be exactly 32 bytes when used as string)
  if (typeof apiKey !== 'string' || apiKey.length < 32) {
    throw new Error(
      `FATAL: API_ENCRYPTION_KEY must be at least 32 characters long for AES-256 security. Current length: ${apiKey.length}. Service startup failed.`
    );
  }
  
  // Additional validation: ensure it's not the old default value
  if (apiKey.includes('dev-key-change-in-production') || apiKey === 'dev-key-change-in-production-32-bytes') {
    throw new Error(
      'FATAL: API_ENCRYPTION_KEY appears to be using a default/example value. Please set a secure encryption key. Service startup failed.'
    );
  }
  
  return apiKey;
}

// Validate encryption key on module load (startup)
const MASTER_KEY = validateAndGetEncryptionKey();

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
    serverToken: v.string(),
    clerkId: v.string(),
    provider: v.string(),
    keyName: v.string(),
    apiKey: v.string(),
    isActive: v.boolean(),
  },
  returns: v.id("userApiKeys"),
  handler: async (ctx, args): Promise<Id<"userApiKeys">> => {
    requireServerToken(args.serverToken);
    // Basic provider validation - just check it's one of the known providers
    if (!(args.provider in API_PROVIDERS)) {
      throw new Error(`Invalid API provider: ${args.provider}`);
    }

    // Skip format validation - let the APIs themselves validate the keys
    // API key formats change over time and vary too much to reliably validate client-side

    // Create display version and encrypt the API key server-side
    const displayKey = createDisplayKey(args.apiKey);
    const encryptedKey = await encryptValue(args.apiKey);
    
    // Store in database via mutation
    const keyId: Id<"userApiKeys"> = await ctx.runMutation(api.apiKeys.upsertApiKey, {
      serverToken: args.serverToken,
      clerkId: args.clerkId,
      provider: args.provider,
      keyName: args.keyName,
      encryptedKey,
      displayKey,
      isActive: args.isActive,
    });
    return keyId;
  },
});

export const addMyApiKeyWithEncryption = action({
  args: {
    provider: v.string(),
    keyName: v.string(),
    apiKey: v.string(),
    isActive: v.boolean(),
  },
  returns: v.id("userApiKeys"),
  handler: async (ctx, args): Promise<Id<"userApiKeys">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    if (!(args.provider in API_PROVIDERS)) {
      throw new Error(`Invalid API provider: ${args.provider}`);
    }

    const displayKey = createDisplayKey(args.apiKey);
    const encryptedKey = await encryptValue(args.apiKey);

    const keyId: Id<"userApiKeys"> = await ctx.runMutation(internal.apiKeys._upsertMyApiKeyEncrypted, {
      provider: args.provider,
      keyName: args.keyName,
      encryptedKey,
      displayKey,
      isActive: args.isActive,
    });
    return keyId;
  },
});
