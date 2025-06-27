import { config } from 'dotenv';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

// Load environment variables from multiple possible locations
config({ path: '.env.local' });
config({ path: '.env' });

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function populateCoinglassSupportedCoins() {
  try {
    console.log('=== Environment Debug ===');
    console.log('CG_API_KEY:', process.env.CG_API_KEY ? 'SET' : 'NOT SET');
    console.log('CG-API-KEY:', process.env['CG-API-KEY'] ? 'SET' : 'NOT SET');
    console.log('Available env vars starting with CG:', Object.keys(process.env).filter(key => key.startsWith('CG')));
    
    // Try both possible environment variable names
    const apiKey = process.env.CG_API_KEY || process.env['CG-API-KEY'];
    
    if (!apiKey) {
      console.error('❌ API key not found in environment variables');
      console.log('Make sure you have either CG_API_KEY or CG-API-KEY in your .env or .env.local file');
      return;
    }
    
    console.log('✅ API key found, length:', apiKey.length);
    console.log('Fetching supported coins from CoinGlass...');
    
    const response = await fetch(
      `https://open-api-v4.coinglass.com/api/futures/supported-coins`,
      {
        headers: {
          'CG_API_KEY': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

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
      symbols: supportedSymbols 
    });

    console.log('✅ Successfully updated CoinGlass supported coins!');
    console.log(`Total coins: ${supportedSymbols.length}`);
    
    // Display some stats
    const activeCoins = await convex.query(api.coins.getCoinglassSupportedCoins, { onlyActive: true });
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
      const isSupported = await convex.query(api.coins.isCoinglassSupported, { symbol });
      console.log(`${symbol}: ${isSupported ? '✅ Supported' : '❌ Not supported'}`);
    }
    
    const allSupportedSymbols = await convex.query(api.coins.getCoinglassSupportedSymbols, {});
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