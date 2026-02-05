import { config } from 'dotenv';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import path from 'path';

// Load environment variables from multiple possible locations
config({ path: path.join(process.cwd(), '.env.local') });
config({ path: path.join(process.cwd(), '.env') });

console.log('=== Environment Debug ===');
console.log('Current working directory:', process.cwd());
console.log('NEXT_PUBLIC_CONVEX_URL:', process.env.NEXT_PUBLIC_CONVEX_URL ? 'SET' : 'NOT SET');
console.log('CG_API_KEY:', process.env.CG_API_KEY ? 'SET' : 'NOT SET');
console.log('CG-API-KEY:', process.env['CG-API-KEY'] ? 'SET' : 'NOT SET');
console.log('INTERNAL_CONVEX_SERVER_TOKEN:', process.env.INTERNAL_CONVEX_SERVER_TOKEN ? 'SET' : 'NOT SET');

// Check required environment variables
if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  console.error('❌ NEXT_PUBLIC_CONVEX_URL is not set');
  console.log('Please add NEXT_PUBLIC_CONVEX_URL to your .env.local file');
  process.exit(1);
}

if (!process.env.INTERNAL_CONVEX_SERVER_TOKEN) {
  console.error('❌ INTERNAL_CONVEX_SERVER_TOKEN is not set');
  console.log('Please add INTERNAL_CONVEX_SERVER_TOKEN to your .env.local file');
  process.exit(1);
}

const apiKey = process.env.CG_API_KEY || process.env['CG-API-KEY'];
if (!apiKey) {
  console.error('❌ Neither CG_API_KEY nor CG-API-KEY is set');
  console.log('Please add CG_API_KEY to your .env.local file');
  process.exit(1);
}

// Add this assertion after the check
const apiKeyConfirmed = apiKey as string;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
const serverToken = process.env.INTERNAL_CONVEX_SERVER_TOKEN;

async function populateCoinglassSupportedCoins() {
  try {
    console.log('✅ Environment variables loaded successfully');
    console.log('✅ API key found, length:', apiKeyConfirmed.length);
    console.log('Fetching supported coins from CoinGlass...');
    
    const response = await fetch(
      `https://open-api-v4.coinglass.com/api/futures/supported-coins`,
      {
        headers: {
          'CG-API-KEY': apiKeyConfirmed,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response body:', errorText);
      throw new Error(`CoinGlass API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('API Response:', { code: data.code, msg: data.msg, dataLength: data.data?.length });
    
    if (data.code !== "0") {
      throw new Error(`CoinGlass API error: ${data.msg}`);
    }

    const supportedSymbols = data.data as string[];
    console.log(`Found ${supportedSymbols.length} supported coins from CoinGlass`);
    console.log('Sample symbols:', supportedSymbols.slice(0, 10));

    // Use our Convex mutation to update the database
    console.log('Updating database with supported coins...');
    await convex.mutation(api.coins.bulkUpsertCoinglassSupportedCoins, { 
      serverToken,
      symbols: supportedSymbols 
    });

    console.log('✅ Successfully updated CoinGlass supported coins!');
    console.log(`Total coins: ${supportedSymbols.length}`);
    
    // Display some stats
    const activeCoins = await convex.query(api.coins.getCoinglassSupportedCoins, { serverToken, onlyActive: true });
    console.log(`Active supported coins in DB: ${activeCoins.length}`);
    
  } catch (error) {
    console.error('❌ Failed to populate CoinGlass supported coins:', error);
    process.exit(1);
  }
}

// Also create a verification function
async function verifyCoinglassSupport() {
  try {
    console.log('\n--- Verification ---');
    
    // Test some common symbols
    const testSymbols = ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA'];
    
    for (const symbol of testSymbols) {
      const isSupported = await convex.query(api.coins.isCoinglassSupported, { serverToken, symbol });
      console.log(`${symbol}: ${isSupported ? '✅ Supported' : '❌ Not supported'}`);
    }
    
    const allSupportedSymbols = await convex.query(api.coins.getCoinglassSupportedSymbols, { serverToken });
    console.log(`\nTotal supported symbols: ${allSupportedSymbols.length}`);
    console.log('First 20 symbols:', allSupportedSymbols.slice(0, 20).join(', '));
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Main execution
async function main() {
  await populateCoinglassSupportedCoins();
  // Only run verification if the population was successful
  if (process.exitCode !== 1) {
    await verifyCoinglassSupport();
  }
}

main();