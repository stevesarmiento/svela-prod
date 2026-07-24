// Server-side only encryption utilities
import { createDecipheriv, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '@/env.mjs';

// Ensure this only runs on the server
if (typeof window !== 'undefined') {
  throw new Error('Encryption utilities can only be used server-side');
}

// Convert scrypt to promise-based
const asyncScrypt = promisify(scrypt);

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const TAG_LENGTH = 16; // 128 bits

// Generate a secret key from environment with proper validation
function initializeMasterKey(): string {
  const apiEncryptionKey = env.API_ENCRYPTION_KEY;
  
  // Only require encryption key at runtime in production, not during build
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                     process.env.NEXT_PHASE === 'phase-export' ||
                     process.env.npm_lifecycle_event?.includes('build');
  
  if (process.env.NODE_ENV === 'production' && !isBuildTime) {
    if (!apiEncryptionKey) {
      throw new Error('API_ENCRYPTION_KEY environment variable is required in production runtime');
    }
    return apiEncryptionKey;
  }
  
  // Non-production environment
  if (!apiEncryptionKey) {
    console.warn('⚠️  API_ENCRYPTION_KEY not set. Using development fallback. DO NOT use in production!');
    return 'dev-key-change-in-production-32-bytes';
  }
  
  return apiEncryptionKey;
}

const MASTER_KEY = initializeMasterKey();

/**
 * Derives an encryption key from the master key and salt
 */
async function deriveKey(salt: Buffer): Promise<Buffer> {
  return (await asyncScrypt(MASTER_KEY, salt, KEY_LENGTH)) as Buffer;
}

/**
 * Decrypts a base64 encoded encrypted string
 * Returns the original plaintext
 */
export async function decryptValue(encryptedData: string): Promise<string> {
  try {
    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key from master key and salt
    const key = await deriveKey(salt);
    
    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt API key - key may be corrupted');
  }
}
