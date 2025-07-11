import 'dotenv/config';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { getCoinsList } from '../lib/coingecko';

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured');
}

if (!process.env.X_CG_PRO_API_KEY) {
  throw new Error('X_CG_PRO_API_KEY is not configured. Please add it to your .env.local file');
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

interface CoinGeckoListItem {
  id: string;
  symbol: string;
  name: string;
  platforms?: Record<string, string>;
}

async function populateCoinGeckoCoins() {
  try {
    console.log('🚀 Starting CoinGecko coins population...');
    console.log('API Key configured:', !!process.env.X_CG_PRO_API_KEY);
    
    // Fetch coins list from CoinGecko with platform data
    console.log('📡 Fetching coins list from CoinGecko...');
    const coins = await getCoinsList(true); // Include platform data
    
    console.log(`✅ Successfully fetched ${coins.length} coins from CoinGecko`);
    
    // Transform coins for database
    const transformedCoins = coins.map((coin: CoinGeckoListItem) => ({
      coingeckoId: coin.id,
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      logoUrl: `https://assets.coingecko.com/coins/images/${coin.id.replace(/[^a-zA-Z0-9-]/g, '')}/small/${coin.id}.png`,
      isActive: true,
      platforms: coin.platforms || {},
    }));

    console.log(`🔄 Transformed ${transformedCoins.length} coins for database insertion`);
    
    // Insert CoinGecko coins into the dedicated CoinGecko table
    try {
      console.log('📊 Adding all coins to CoinGecko table...');
      
      // Process all coins for complete dataset
      const coinsToInsert = transformedCoins;
      
      // Insert CoinGecko coins in chunks
      const chunkSize = 25; // Smaller chunks for better reliability with large dataset
      const totalChunks = Math.ceil(coinsToInsert.length / chunkSize);
      const startTime = Date.now();
      
      console.log(`📦 Processing ${coinsToInsert.length} coins in ${totalChunks} chunks of ${chunkSize}...`);
      
      for (let i = 0; i < coinsToInsert.length; i += chunkSize) {
        const chunkIndex = Math.floor(i / chunkSize) + 1;
        const chunk = coinsToInsert.slice(i, i + chunkSize);
        
        await convex.mutation(api.coins.bulkUpsertCoinGeckoCoins, { coins: chunk });
        
        const progress = Math.min(i + chunkSize, coinsToInsert.length);
        const percentage = ((progress / coinsToInsert.length) * 100).toFixed(1);
        const elapsed = Date.now() - startTime;
        const estimatedTotal = (elapsed / progress) * coinsToInsert.length;
        const remaining = Math.max(0, estimatedTotal - elapsed);
        
        console.log(`✅ Chunk ${chunkIndex}/${totalChunks} - Progress: ${progress}/${coinsToInsert.length} (${percentage}%) - ETA: ${Math.round(remaining / 1000)}s`);
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      console.log('✅ Successfully added CoinGecko coins to CoinGecko table!');
      
    } catch (error) {
      console.error('❌ Failed to populate coins:', error);
      throw error;
    }
    
    // Print some statistics
    const uniqueSymbols = new Set(transformedCoins.map(coin => coin.symbol)).size;
    const platformCount = transformedCoins.filter(coin => coin.platforms && Object.keys(coin.platforms).length > 0).length;
    
    console.log('\n📊 Population Statistics:');
    console.log(`  Total coins: ${transformedCoins.length}`);
    console.log(`  Unique symbols: ${uniqueSymbols}`);
    console.log(`  Coins with platform data: ${platformCount}`);
    console.log(`  Sample coin: ${transformedCoins[0]?.name} (${transformedCoins[0]?.symbol})`);
    
    // Test rate limiting
    console.log('\n🚦 Rate limit status:');
    const { getRateLimitStatus } = await import('../lib/coingecko');
    const rateLimitStatus = getRateLimitStatus();
    console.log(`  Requests used: ${rateLimitStatus.requestsUsed}/${rateLimitStatus.requestsUsed + rateLimitStatus.requestsRemaining}`);
    console.log(`  Requests remaining: ${rateLimitStatus.requestsRemaining}`);
    console.log(`  Reset in: ${rateLimitStatus.resetTimeSeconds} seconds`);
    
  } catch (error) {
    console.error('❌ Failed to populate CoinGecko coins:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Rate limit')) {
        console.log('💡 Rate limit hit. You can run this script again in a minute.');
      } else if (error.message.includes('API key')) {
        console.log('💡 Make sure your X_CG_PRO_API_KEY is set correctly in .env.local');
      }
    }
    
    process.exit(1);
  }
}

// Test the API connection first
async function testConnection() {
  try {
    console.log('🔍 Testing CoinGecko API connection...');
    const { searchCoins } = await import('../lib/coingecko');
    const testResult = await searchCoins('bitcoin');
    console.log(`✅ API connection test successful! Found ${testResult.coins.length} results for "bitcoin"`);
    return true;
  } catch (error) {
    console.error('❌ API connection test failed:', error);
    return false;
  }
}

// Main execution
async function main() {
  console.log('🪙 CoinGecko Coins Population Script');
  console.log('=====================================\n');
  
  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.log('💡 Please check your X_CG_PRO_API_KEY and try again.');
    process.exit(1);
  }
  
  console.log('');
  await populateCoinGeckoCoins();
  
  console.log('\n🎉 Script completed successfully!');
  console.log('You can now use the CoinGecko integration in your app.');
}

if (require.main === module) {
  main().catch(console.error);
} 