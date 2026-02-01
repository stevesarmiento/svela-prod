import { config } from "dotenv";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

// Load environment variables (so running via `tsx` behaves like Next).
config({ path: path.join(process.cwd(), ".env.local") });
config({ path: path.join(process.cwd(), ".env") });

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured');
}

if (!process.env.X_CG_PRO_API_KEY) {
  throw new Error('X_CG_PRO_API_KEY is not configured. Please add it to your .env.local file');
}

if (!process.env.INTERNAL_CONVEX_SERVER_TOKEN) {
  throw new Error('INTERNAL_CONVEX_SERVER_TOKEN is not configured.');
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
const serverToken = process.env.INTERNAL_CONVEX_SERVER_TOKEN;

interface CoinGeckoListItem {
  id: string;
  symbol: string;
  name: string;
  platforms?: Record<string, string>;
}

interface CoinGeckoApiResponse {
  [key: string]: {
    id: string;
    name: string;
    symbol: string;
    image: string;
  };
}

// Fetch real image URLs from API
async function fetchRealImageUrls(coingeckoIds: string[]): Promise<CoinGeckoApiResponse> {
  const { getCoinsMarketData } = await import("../lib/coingecko");
  const chunkSize = 200; // Keep URLs reasonable (CoinGecko allows up to 250 per page)
  const chunks: string[][] = [];

  for (let i = 0; i < coingeckoIds.length; i += chunkSize) {
    chunks.push(coingeckoIds.slice(i, i + chunkSize));
  }

  const allResults: CoinGeckoApiResponse = {};

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk?.length) continue;

    try {
      console.log(`  📡 Fetching market data ${i + 1}/${chunks.length} (${chunk.length} coins)...`);

      const marketData = await getCoinsMarketData(
        chunk,
        "usd",
        "market_cap_desc",
        Math.min(chunk.length, 250),
        1,
        false,
        "24h",
      );

      for (const coin of marketData as Array<{
        id: string;
        name: string;
        symbol: string;
        image: string;
      }>) {
        if (!coin?.id) continue;
        allResults[coin.id] = {
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol,
          image: coin.image,
        };
      }

      console.log(`  ✅ Got ${Object.keys(allResults).length} image URLs so far`);
    } catch (error) {
      console.error(`  ❌ Error fetching market data:`, error);
    }

    // Rate limit friendly delay
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  return allResults;
}

async function populateCoinGeckoCoins() {
  try {
    console.log('🚀 Starting CoinGecko coins population with REAL image URLs...');
    console.log('API Key configured:', !!process.env.X_CG_PRO_API_KEY);
    
    // Fetch coins list from CoinGecko with platform data
    console.log('📡 Fetching coins list from CoinGecko...');
    const { getCoinsList } = await import("../lib/coingecko");
    const coins = await getCoinsList(true); // Include platform data
    
    console.log(`✅ Successfully fetched ${coins.length} coins from CoinGecko`);
    
    // Process in chunks to get real image URLs
    const chunkSize = 100; // Process 100 coins at a time
    const totalChunks = Math.ceil(coins.length / chunkSize);
    const startTime = Date.now();
    
    console.log(`📦 Processing ${coins.length} coins in ${totalChunks} chunks of ${chunkSize}...`);
    
    for (let i = 0; i < coins.length; i += chunkSize) {
      const chunkIndex = Math.floor(i / chunkSize) + 1;
      const chunk = coins.slice(i, i + chunkSize);
      
      console.log(`\n🔄 Processing chunk ${chunkIndex}/${totalChunks}...`);
      console.log(`📊 Coins in chunk: ${chunk.length}`);
      
      // Get real image URLs for this chunk
      const coingeckoIds = chunk.map(coin => coin.id);
      const realImageData = await fetchRealImageUrls(coingeckoIds);
      
      // Transform coins with real image URLs
      const transformedCoins = chunk.map((coin: CoinGeckoListItem) => {
        const realData = realImageData[coin.id];
        
        return {
          coingeckoId: coin.id,
          name: coin.name,
          symbol: coin.symbol.toUpperCase(),
          logoUrl: realData?.image || `https://coin-images.coingecko.com/coins/images/1/thumb/bitcoin.png`, // Fallback
          isActive: true,
          platforms: coin.platforms || {},
          imageUpdated: !!realData?.image, // Mark as updated if we got real image
        };
      });
      
      // Insert into database
      try {
        console.log(`💾 Inserting ${transformedCoins.length} coins into database...`);
        await convex.mutation(api.coins.bulkUpsertCoinGeckoCoins, { serverToken, coins: transformedCoins });
        
        const realImagesCount = transformedCoins.filter(c => c.imageUpdated).length;
        console.log(`✅ Inserted chunk ${chunkIndex} - ${realImagesCount}/${transformedCoins.length} with real images`);
        
      } catch (error) {
        console.error(`❌ Failed to insert chunk ${chunkIndex}:`, error);
        throw error;
      }
      
      // Progress tracking
      const progress = Math.min(i + chunkSize, coins.length);
      const percentage = ((progress / coins.length) * 100).toFixed(1);
      const elapsed = Date.now() - startTime;
      const rate = progress / (elapsed / 1000 / 60); // coins per minute
      const estimatedTotal = (elapsed / progress) * coins.length;
      const remaining = Math.max(0, estimatedTotal - elapsed);
      
      console.log(`📈 Progress: ${progress}/${coins.length} (${percentage}%) - ${rate.toFixed(0)} coins/min - ETA: ${Math.round(remaining / 1000 / 60)}min`);
      
      // Small delay between chunks
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n🎉 Population completed successfully!');

    console.log('\n📊 Final Statistics:');
    console.log(`  Processing time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
    
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

// Main execution
async function main() {
  console.log('🪙 CoinGecko Coins Population Script (With Real Images)');
  console.log('========================================================\n');

  console.log('');
  await populateCoinGeckoCoins();
  
  console.log('\n🎉 Script completed successfully!');
  console.log('Database now contains coins with real CoinGecko image URLs!');
}

if (require.main === module) {
  main().catch(console.error);
} 