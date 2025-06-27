import { config } from 'dotenv';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

// Load environment variables
config({ path: '.env.local' });

const API_KEY = process.env.COINMARKETCAP_API_KEY;
const BASE_URL = 'https://pro-api.coinmarketcap.com';
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

console.log('Environment check:');
console.log('API_KEY exists:', !!API_KEY);
console.log('CONVEX_URL exists:', !!process.env.NEXT_PUBLIC_CONVEX_URL);

if (!API_KEY) {
  throw new Error('COINMARKETCAP_API_KEY is required');
}

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error('NEXT_PUBLIC_CONVEX_URL is required');
}

interface CoinMarketCapMetadata {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  description: string;
  logo: string;
  date_added: string;
  date_launched: string;
  tags: string[];
  category: string;
  platform: {
    id: number;
    name: string;
    symbol: string;
    slug: string;
    token_address: string;
  } | null;
  urls: {
    website?: string[];
    technical_doc?: string[];
    twitter?: string[];
    reddit?: string[];
    message_board?: string[];
    announcement?: string[];
    chat?: string[];
    explorer?: string[];
    source_code?: string[];
  };
}

async function fetchCoinMetadata(ids: string) {
  const response = await fetch(
    `${BASE_URL}/v2/cryptocurrency/info?id=${ids}`,
    {
      headers: {
        'X-CMC_PRO_API_KEY': API_KEY!,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

async function populateMetadata() {
  try {
    console.log('Fetching metadata from CoinMarketCap...');
    
    // Get existing coin IDs from our database instead of assuming sequential IDs
    const existingCoins = await convex.query(api.coins.getTopCoins, { limit: 5000 });
    const coinIds = existingCoins.map(coin => coin.coinId);
    
    console.log(`Found ${coinIds.length} existing coins to fetch metadata for`);
    
    // Process in batches of 100
    const batchSize = 100;
    
    for (let i = 0; i < coinIds.length; i += batchSize) {
      const batch = coinIds.slice(i, i + batchSize);
      const ids = batch.join(',');
      
      try {
        console.log(`Fetching metadata for batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(coinIds.length/batchSize)} (${batch.length} coins)...`);
        
        const response = await fetchCoinMetadata(ids);
        const metadata = [];
        
        for (const [coinId, coinData] of Object.entries(response.data)) {
          const data = coinData as CoinMarketCapMetadata;
          
          // Filter URLs to only include known fields
          const filteredUrls = data.urls ? {
            website: data.urls.website,
            technical_doc: data.urls.technical_doc,
            twitter: data.urls.twitter,
            reddit: data.urls.reddit,
            message_board: data.urls.message_board,
            announcement: data.urls.announcement,
            chat: data.urls.chat,
            explorer: data.urls.explorer,
            source_code: data.urls.source_code,
          } : undefined;
          
          metadata.push({
            coinId: parseInt(coinId),
            slug: data.slug,
            name: data.name,
            symbol: data.symbol,
            description: data.description || undefined,
            logo: data.logo,
            dateAdded: data.date_added || undefined,
            dateLaunched: data.date_launched || undefined,
            tags: data.tags || undefined,
            category: data.category || undefined,
            platform: data.platform ? {
              ...data.platform,
              id: typeof data.platform.id === 'string' ? parseInt(data.platform.id) : data.platform.id
            } : undefined,
            urls: filteredUrls,
          });
        }
        
        // Save to Convex
        await convex.mutation(api.coins.bulkUpsertMetadata, { metadata });
        console.log(`✅ Processed and saved ${metadata.length} coins`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error fetching batch:`, error);
      }
    }
    
    console.log('🎉 Metadata population completed!');
  } catch (error) {
    console.error('❌ Failed to populate metadata:', error);
  }
}

populateMetadata();