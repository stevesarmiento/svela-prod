import { config } from 'dotenv';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { CoinMarketData } from '@/types/coins';

// Load environment variables
config({ path: '.env.local' });

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function populateCoins() {
  try {
    console.log('Fetching coins with ranks from CoinMarketCap...');
    
    // Use listings endpoint which includes ranks
    const response = await fetch(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=1&limit=5000&sort=market_cap&sort_dir=desc`,
      {
        headers: {
          'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY!,
        },
      }
    );

    const data = await response.json();
    
    const coins = data.data.map((coin: CoinMarketData) => ({
      coinId: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      rank: coin.cmc_rank, // This field exists in listings endpoint!
      logoUrl: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
      isActive: true,
    }));

    console.log(`Syncing ${coins.length} coins with ranks to Convex...`);
    
    const chunkSize = 50;
    for (let i = 0; i < coins.length; i += chunkSize) {
      const chunk = coins.slice(i, i + chunkSize);
      await convex.mutation(api.coins.bulkUpsertCoins, { coins: chunk }); // Use upsert to update existing
      console.log(`Progress: ${Math.min(i + chunkSize, coins.length)}/${coins.length}`);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('✅ Successfully updated coins with rank data!');
  } catch (error) {
    console.error('❌ Failed to populate coins:', error);
  }
}

populateCoins();