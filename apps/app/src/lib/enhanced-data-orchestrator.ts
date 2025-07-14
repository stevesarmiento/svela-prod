import type { 
  EnhancedChatIntent, 
  EnhancedDataContext,
  CoinPriceData,
  CoinHistoricalData,
  TechnicalAnalysisData,
  MarketStructureData,
  ComparisonData
} from '@/types/enhanced-chat';

interface CoinSearchResult {
  coinId: string; // Changed to string for CoinGecko IDs
  name: string;
  symbol: string;
}

interface CoinGeckoMarketData {
  id: string;
  current_price: number;
  total_volume: number;
  market_cap: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d: number;
  market_cap_rank: number;
  image: string; // Add image field for CoinGecko image URLs
}

export class EnhancedDataOrchestrator {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  }

  /**
   * Main orchestration method - fetches all required data based on intent
   */
  async orchestrateDataFetch(intent: EnhancedChatIntent): Promise<EnhancedDataContext> {
    const startTime = Date.now();
    console.log('Starting data orchestration for intent:', intent);

    try {
      // Step 1: Resolve coin names to CoinGecko IDs
      const coinIds = await this.resolveCoinIds(intent.coins);
      console.log('🪙 Resolved coin IDs:', coinIds);
      
      if (coinIds.length === 0 && intent.coins.length > 0) {
        console.warn('⚠️ No coins could be resolved for:', intent.coins);
        // Still continue with empty coinIds to see if we can get general market data
      }
      
      // Step 2: Plan data fetching strategy
      const fetchPlan = this.createFetchPlan(intent, coinIds);
      console.log('📋 Created fetch plan:', {
        priceDataTargets: fetchPlan.priceData.length,
        historicalDataTargets: fetchPlan.historicalData.length,
        technicalDataTargets: fetchPlan.technicalData.length,
        marketStructureTargets: fetchPlan.marketStructureData.length,
        hasComparisonData: !!fetchPlan.comparisonData
      });
      
      // Step 3: Execute parallel data fetching
      const dataResults = await this.executeFetchPlan(fetchPlan);
      console.log('📊 Data fetch results:', {
        priceData: dataResults.priceData.length,
        historicalData: dataResults.historicalData.length,
        technicalData: dataResults.technicalData.length,
        marketStructureData: dataResults.marketStructureData.length,
        errors: dataResults.errors.length,
        errorMessages: dataResults.errors
      });
      
      // Step 4: Assemble final data context
      const dataContext = this.assembleDataContext(intent, dataResults, startTime);
      
      // Log warnings if we have errors but still return data
      if (dataResults.errors.length > 0) {
        console.warn('⚠️ Data orchestration completed with errors:', dataResults.errors);
      }
      
      console.log(`✅ Data orchestration completed in ${Date.now() - startTime}ms with quality: ${dataContext.metadata.quality}, coverage: ${Math.round(dataContext.metadata.coverage * 100)}%`);
      return dataContext;
      
    } catch (error) {
      console.error('❌ Data orchestration failed:', error);
      const emptyContext = this.createEmptyDataContext(intent, startTime);
      emptyContext.metadata.sources = ['Error occurred during data fetching'];
      return emptyContext;
    }
  }

  /**
   * Resolve coin names/symbols to CoinGecko IDs
   */
  private async resolveCoinIds(coinNames: string[]): Promise<Array<{ id: string; name: string; symbol: string }>> {
    if (coinNames.length === 0) return [];

    try {
      const searchPromises = coinNames.map(coin => this.searchCoinInDatabase(coin));
      const searchResults = await Promise.all(searchPromises);
      
      // Flatten and deduplicate results
      const resolvedCoins = new Map<string, { id: string; name: string; symbol: string }>();
      
      searchResults.flat().forEach(coin => {
        if (coin && coin.id) {
          resolvedCoins.set(coin.id, coin);
        }
      });
      
      const results = Array.from(resolvedCoins.values());
      console.log(`Resolved ${coinNames.length} coin names to ${results.length} IDs:`, results);
      
      return results;
    } catch (error) {
      console.error('Failed to resolve coin IDs:', error);
      return [];
    }
  }

  /**
   * Search for coin in database - now returns CoinGecko string IDs
   */
  private async searchCoinInDatabase(query: string): Promise<{ id: string; name: string; symbol: string } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/convex/search-coins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 1 })
      });
      
      if (!response.ok) return null;
      
      const coins: CoinSearchResult[] = await response.json();
      
      if (coins.length > 0 && coins[0]) {
        return {
          id: coins[0].coinId,
          name: coins[0].name,
          symbol: coins[0].symbol
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error searching coin in database:', error);
      return null;
    }
  }

  /**
   * Create a strategic plan for data fetching based on intent
   */
  private createFetchPlan(
    intent: EnhancedChatIntent, 
    coinIds: Array<{ id: string; name: string; symbol: string }>
  ): FetchPlan {
    const plan: FetchPlan = {
      priceData: [],
      historicalData: [],
      technicalData: [],
      marketStructureData: [],
      comparisonData: null
    };

    // Price data for all coins
    if (intent.dataTypes.includes('price')) {
      plan.priceData = coinIds.map(coin => ({
        coinId: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        endpoints: ['/api/coingecko/markets'] // Updated to CoinGecko endpoint
      }));
    }

    // Historical data for timeline analysis
    if (intent.dataTypes.includes('historical') || intent.visualizationType?.includes('line_chart')) {
      plan.historicalData = coinIds.map(coin => ({
        coinId: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        timeframe: intent.timeframe || '30d',
        endpoints: ['/api/coingecko/market-chart'] // Updated to CoinGecko endpoint
      }));
    }

    // Technical analysis data
    if (intent.dataTypes.includes('technical') || intent.analysisDepth === 'comprehensive') {
      plan.technicalData = coinIds.map(coin => ({
        coinId: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        timeframe: intent.timeframe || '30d',
        endpoints: ['/api/coingecko/ohlc'] // Updated to CoinGecko endpoint
      }));
    }

    // Market structure data
    if (intent.dataTypes.includes('market_structure')) {
      plan.marketStructureData = coinIds.map(coin => ({
        coinId: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        endpoints: this.getMarketStructureEndpoints(intent.dataTypes)
      }));
    }

    // Comparison data for multiple coins
    if (coinIds.length > 1 && intent.analysisDepth === 'comprehensive') {
      plan.comparisonData = {
        coinIds: coinIds.map(coin => coin.id),
        timeframe: intent.timeframe || '30d',
        metrics: ['price', 'volume', 'market_cap']
      };
    }

    return plan;
  }

  /**
   * Determine which market structure endpoints to call
   */
  private getMarketStructureEndpoints(dataTypes: string[]): string[] {
    const endpoints: string[] = [];
    
    if (dataTypes.includes('liquidations')) {
      endpoints.push('/api/coinglass/liquidation/aggregated-history');
    }
    if (dataTypes.includes('open_interest')) {
      endpoints.push('/api/coinglass/open-interest/aggregated-history');
    }
    if (dataTypes.includes('funding_rates')) {
      endpoints.push('/api/coinglass/funding-rate/exchange-list');
    }
    if (dataTypes.includes('taker_buy_sell')) {
      endpoints.push('/api/coinglass/taker-buy-sell/exchange-list');
    }
    
    return endpoints;
  }

  /**
   * Execute the fetch plan in parallel
   */
  private async executeFetchPlan(plan: FetchPlan): Promise<FetchResults> {
    const results: FetchResults = {
      priceData: [],
      historicalData: [],
      technicalData: [],
      marketStructureData: [],
      comparisonData: null,
      errors: []
    };

    const promises: Promise<void>[] = [];

    if (plan.priceData.length > 0) {
      promises.push(this.fetchPriceData(plan.priceData, results));
    }

    if (plan.historicalData.length > 0) {
      promises.push(this.fetchHistoricalData(plan.historicalData, results));
    }

    if (plan.technicalData.length > 0) {
      promises.push(this.fetchTechnicalData(plan.technicalData, results));
    }

    if (plan.marketStructureData.length > 0) {
      promises.push(this.fetchMarketStructureData(plan.marketStructureData, results));
    }

    if (plan.comparisonData) {
      promises.push(this.fetchComparisonData(plan.comparisonData, results));
    }

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Fetch price data from CoinGecko
   */
  private async fetchPriceData(
    priceTargets: Array<{ coinId: string; name: string; symbol: string }>,
    results: FetchResults
  ): Promise<void> {
    try {
      console.log('💰 Fetching price data for coins:', priceTargets.map(t => `${t.name} (${t.coinId})`));
      
      const coinIds = priceTargets.map(t => t.coinId).join(',');
      const url = `${this.baseUrl}/api/coingecko/markets?ids=${coinIds}`;
      console.log('🌐 Calling CoinGecko markets API:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ CoinGecko markets API error:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 200)
        });
        throw new Error(`Failed to fetch price data: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('📊 CoinGecko markets API response:', {
        hasData: !!data.data,
        dataLength: data.data?.length || 0,
        dataPreview: data.data?.[0] ? {
          id: data.data[0].id,
          name: data.data[0].name,
          current_price: data.data[0].current_price
        } : null
      });
      
      if (data.data && Array.isArray(data.data)) {
      priceTargets.forEach(target => {
          const coinData = data.data.find((coin: CoinGeckoMarketData) => coin.id === target.coinId);
        if (coinData) {
            console.log(`✅ Found price data for ${target.name}: $${coinData.current_price}`);
          results.priceData.push(this.transformToPriceData(coinData, target));
          } else {
            console.warn(`⚠️ No price data found for ${target.name} (${target.coinId})`);
        }
      });
        
        console.log(`💰 Successfully processed ${results.priceData.length}/${priceTargets.length} price data entries`);
      } else {
        console.warn('⚠️ Invalid or empty price data response:', data);
        results.errors.push('Price data: Invalid response format from CoinGecko markets API');
      }
      
    } catch (error) {
      console.error('❌ Price data fetch failed:', error);
      results.errors.push(`Price data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch historical data for coins from CoinGecko
   */
  private async fetchHistoricalData(
    historicalTargets: Array<{ coinId: string; name: string; symbol: string; timeframe: string }>,
    results: FetchResults
  ): Promise<void> {
    try {
      const promises = historicalTargets.map(async (target) => {
        try {
          const response = await fetch(
            `${this.baseUrl}/api/coingecko/market-chart?id=${target.coinId}&vs_currency=usd&days=${this.mapTimeframeToDays(target.timeframe)}`
          );
          
          if (!response.ok) throw new Error(`Failed to fetch historical data for ${target.coinId}`);
          
          const data = await response.json();
          const transformedData = this.transformToHistoricalData(data, target);
          
          if (transformedData) {
            results.historicalData.push(transformedData);
          }
        } catch (error) {
          console.error(`Historical data fetch failed for ${target.coinId}:`, error);
          results.errors.push(`Historical data for ${target.coinId}: ${error}`);
        }
      });

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Historical data batch fetch failed:', error);
      results.errors.push(`Historical data batch: ${error}`);
    }
  }

  /**
   * Fetch technical analysis data from CoinGecko OHLC
   */
  private async fetchTechnicalData(
    technicalTargets: Array<{ coinId: string; name: string; symbol: string; timeframe: string }>,
    results: FetchResults
  ): Promise<void> {
    try {
      const promises = technicalTargets.map(async (target) => {
        try {
          const response = await fetch(
            `${this.baseUrl}/api/coingecko/ohlc?id=${target.coinId}&vs_currency=usd&days=${this.mapTimeframeToDays(target.timeframe)}`
          );
          
          if (!response.ok) throw new Error(`Failed to fetch OHLC data for ${target.coinId}`);
          
          const data = await response.json();
          
                     // Transform OHLC data to technical analysis format
           if (data.data && Array.isArray(data.data)) {
             const technicalData: TechnicalAnalysisData = {
               coinId: parseInt(target.coinId, 10) || 0, // Convert string to number for interface compatibility
               indicators: {
                 rsi: { value: 50, signal: 'neutral' },
                 macd: { value: 0, signal: 0, histogram: 0 },
                 bollinger: { upper: 0, middle: 0, lower: 0, position: 'middle' }
               },
               signals: {
                 overall: 'neutral',
                 strength: 'moderate',
                 confidence: 0.5
               },
               trends: {
                 short: 'sideways',
                 medium: 'sideways',
                 long: 'sideways'
               }
             };
            
            results.technicalData.push(technicalData);
          }
        } catch (error) {
          console.error(`Technical data fetch failed for ${target.coinId}:`, error);
          results.errors.push(`Technical data for ${target.coinId}: ${error}`);
        }
      });
      
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Technical data batch fetch failed:', error);
      results.errors.push(`Technical data batch: ${error}`);
    }
  }

  /**
   * Fetch market structure data from various sources
   */
  private async fetchMarketStructureData(
    marketTargets: Array<{ coinId: string; name: string; symbol: string; endpoints: string[] }>,
    results: FetchResults
  ): Promise<void> {
    try {
    const promises = marketTargets.map(async (target) => {
        const marketData: Partial<MarketStructureData> = {
          coinId: parseInt(target.coinId, 10) || 0,
          liquidations: undefined,
          openInterest: undefined,
          fundingRate: undefined,
          orderFlow: undefined
        };

        const fetchPromises = target.endpoints.map(async (endpoint) => {
          try {
            const response = await fetch(`${this.baseUrl}${endpoint}?symbol=${target.coinId}`);
            
            if (response.ok) {
          const data = await response.json();
          this.integrateMarketStructureData(marketData, endpoint, data);
            }
        } catch (error) {
            console.error(`Failed to fetch from ${endpoint} for ${target.coinId}:`, error);
            results.errors.push(`${endpoint} for ${target.coinId}: ${error}`);
        }
      });
      
        await Promise.allSettled(fetchPromises);
      
        if (Object.values(marketData).some(v => v !== undefined)) {
        results.marketStructureData.push(marketData as MarketStructureData);
      }
    });
    
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Market structure data batch fetch failed:', error);
      results.errors.push(`Market structure data batch: ${error}`);
    }
  }

  /**
   * Fetch comparison data for multiple coins
   */
  private async fetchComparisonData(
    comparisonTarget: { coinIds: string[]; timeframe: string; metrics: string[] },
    results: FetchResults
  ): Promise<void> {
    try {
      // Fetch bulk data for comparison
      const coinIds = comparisonTarget.coinIds.join(',');
      
      // Could implement bulk comparison endpoint or aggregate individual calls
      const response = await fetch(`${this.baseUrl}/api/coingecko/markets?ids=${coinIds}`);
      
      if (response.ok) {
        const data = await response.json();
        // Transform to comparison format
        const coinPriceData = (data.data || []).map((coinData: CoinGeckoMarketData) => ({
          id: parseInt(coinData.id, 10) || 0,
          name: coinData.id,
          symbol: coinData.id,
          price: coinData.current_price,
          priceChange24h: coinData.price_change_percentage_24h,
          volume24h: coinData.total_volume,
          marketCap: coinData.market_cap,
          rank: coinData.market_cap_rank,
          lastUpdated: new Date().toISOString()
        }));
        
        results.comparisonData = {
          coins: coinPriceData,
          metrics: {
            performance: coinPriceData.map((coin: CoinPriceData) => ({
              coinId: coin.id,
              change24h: coin.priceChange24h || 0,
              change7d: 0
            }))
          }
        };
      }
    } catch (error) {
      console.error('Comparison data fetch failed:', error);
      results.errors.push(`Comparison data: ${error}`);
    }
  }

  private mapTimeframeToDays(timeframe: string): string {
    const timeframeMap: Record<string, string> = {
      '1h': '1',
      '4h': '1', 
      '1d': '1',
      '7d': '7',
      '30d': '30',
      '90d': '90',
      '1y': '365',
      'max': 'max'
    };
    return timeframeMap[timeframe] || '30';
  }

  /**
   * Transform CoinGecko API response to our price data format
   */
  private transformToPriceData(
    apiData: Record<string, unknown>, 
    target: { coinId: string; name: string; symbol: string }
  ): CoinPriceData {
    return {
      id: parseInt(target.coinId, 10) || 0,
      name: target.name,
      symbol: target.symbol,
      price: Number(apiData.current_price) || 0,
      volume24h: Number(apiData.total_volume) || 0,
      marketCap: Number(apiData.market_cap) || 0,
      priceChange24h: Number(apiData.price_change_percentage_24h) || 0,
      priceChange7d: Number(apiData.price_change_percentage_7d) || 0,
      rank: Number(apiData.market_cap_rank) || 0,
      lastUpdated: new Date().toISOString(),
      image: apiData.image as string || '' // Add image field
    };
  }

  /**
   * Transform CoinGecko historical data to our format
   */
  private transformToHistoricalData(
    apiData: Record<string, unknown>,
    target: { coinId: string; name: string; symbol: string; timeframe: string }
  ): CoinHistoricalData | null {
    try {
      const prices = apiData.prices as number[][];
      const volumes = apiData.total_volumes as number[][];
      
      if (!Array.isArray(prices) || prices.length === 0) {
        return null;
      }

      const dataPoints = prices.map((pricePoint, index) => {
        const volume = volumes && volumes[index] ? volumes[index][1] : 0;
        return {
          timestamp: pricePoint[0],
          price: pricePoint[1],
          volume: volume
        };
      });
      
      return {
        coinId: parseInt(target.coinId, 10) || 0,
        timeframe: target.timeframe,
        prices: dataPoints.map(point => ({
          timestamp: point.timestamp || 0,
          price: point.price || 0
        })),
        volumes: dataPoints.map(point => ({
          timestamp: point.timestamp || 0,
          volume: point.volume || 0
        }))
      };
    } catch (error) {
      console.error('Failed to transform historical data:', error);
      return null;
    }
  }

  private getResolutionFromTimeframe(timeframe: string): string {
    const resolutionMap: Record<string, string> = {
      '1h': '5m',
      '4h': '15m',
      '1d': '1h',
      '7d': '4h',
      '30d': '1d',
      '90d': '1d',
      '1y': '1w',
      'max': '1M'
    };
    return resolutionMap[timeframe] || '1d';
  }

  /**
   * Integrate market structure data from various endpoints (CoinGlass format)
   */
  private integrateMarketStructureData(
    marketData: Partial<MarketStructureData>,
    endpoint: string,
    data: Record<string, unknown>
  ): void {
    try {
      if (endpoint.includes('liquidation')) {
          marketData.liquidations = {
          total24h: Number(data.total) || 0,
          longs24h: Number(data.long) || 0,
          shorts24h: Number(data.short) || 0,
          ratio: Number(data.long) > 0 ? Number(data.short) / Number(data.long) : 0
        };
      } else if (endpoint.includes('open-interest')) {
            marketData.openInterest = {
          current: Number(data.current) || 0,
          change24h: Number(data.change24h) || 0,
          trend: 'stable' as const
        };
      } else if (endpoint.includes('funding-rate')) {
        marketData.fundingRate = {
          current: 0,
          average24h: 0,
          trend: 'stable' as const
        };
      } else if (endpoint.includes('taker-buy-sell')) {
          marketData.orderFlow = {
          buyPressure: Number(data.buyRatio) || 0,
          sellPressure: Number(data.sellRatio) || 0,
          netFlow: (Number(data.buyRatio) || 0) > (Number(data.sellRatio) || 0) ? 'bullish' as const : 'bearish' as const
          };
      }
    } catch (error) {
      console.error(`Failed to integrate data from ${endpoint}:`, error);
    }
  }

  /**
   * Assemble the final data context
   */
  private assembleDataContext(
    intent: EnhancedChatIntent,
    results: FetchResults,
    startTime: number
  ): EnhancedDataContext {
    const sources = this.getDataSources(intent.dataTypes);
    const quality = this.calculateDataQuality(results);
    const coverage = this.calculateDataCoverage(intent, results);
      
      return {
        intent,
      priceData: results.priceData[0] || undefined,
      historicalData: results.historicalData[0] || undefined,
      technicalData: results.technicalData[0] || undefined,
      marketStructureData: results.marketStructureData[0] || undefined,
      multiCoinData: results.priceData.length > 1 ? { 
          priceData: results.priceData,
          historicalData: results.historicalData,
          marketStructureData: results.marketStructureData
      } : undefined,
      comparisonData: results.comparisonData || undefined,
      metadata: {
        sources,
        quality,
        coverage,
        fetchTime: Date.now() - startTime
      }
    };
  }

  private calculateDataQuality(results: FetchResults): 'high' | 'medium' | 'low' {
    const totalExpected = 5; // price, historical, technical, market, comparison
    const successfulFetches = [
      results.priceData.length,
      results.historicalData.length,
      results.technicalData.length,
      results.marketStructureData.length,
      results.comparisonData ? 1 : 0
    ].filter(count => count > 0).length;

    const successRate = successfulFetches / totalExpected;
    
    if (successRate >= 0.8) return 'high';
    if (successRate >= 0.5) return 'medium';
    return 'low';
  }

  private calculateDataCoverage(intent: EnhancedChatIntent, results: FetchResults): number {
    const requestedTypes = intent.dataTypes.length;
    const fulfilledTypes = [
      results.priceData.length > 0 && intent.dataTypes.includes('price'),
      results.historicalData.length > 0 && intent.dataTypes.includes('historical'),
      results.technicalData.length > 0 && intent.dataTypes.includes('technical'),
      results.marketStructureData.length > 0 && intent.dataTypes.includes('market_structure')
    ].filter(Boolean).length;

    return requestedTypes > 0 ? fulfilledTypes / requestedTypes : 0;
  }

  /**
   * Create empty data context for error cases
   */
  private createEmptyDataContext(intent: EnhancedChatIntent, startTime: number): EnhancedDataContext {
    return {
      intent,
      priceData: undefined,
      historicalData: undefined,
      technicalData: undefined,
      marketStructureData: undefined,
      multiCoinData: undefined,
      comparisonData: undefined,
      metadata: {
        sources: [],
        quality: 'low',
        coverage: 0,
        fetchTime: Date.now() - startTime
      }
    };
  }

  /**
   * Get data sources based on requested data types
   */
  private getDataSources(dataTypes: string[]): string[] {
    const sources: string[] = ['CoinGecko']; // Updated primary source
    
    if (dataTypes.some(type => ['liquidations', 'open_interest', 'funding_rates', 'taker_buy_sell'].includes(type))) {
      sources.push('CoinGlass');
    }
    
    return sources;
  }
}

// Internal types for orchestration
interface FetchPlan {
  priceData: Array<{ coinId: string; name: string; symbol: string; endpoints: string[] }>;
  historicalData: Array<{ coinId: string; name: string; symbol: string; timeframe: string; endpoints: string[] }>;
  technicalData: Array<{ coinId: string; name: string; symbol: string; timeframe: string; endpoints: string[] }>;
  marketStructureData: Array<{ coinId: string; name: string; symbol: string; endpoints: string[] }>;
  comparisonData: { coinIds: string[]; timeframe: string; metrics: string[] } | null;
}

interface FetchResults {
  priceData: CoinPriceData[];
  historicalData: CoinHistoricalData[];
  technicalData: TechnicalAnalysisData[];
  marketStructureData: MarketStructureData[];
  comparisonData: ComparisonData | null;
  errors: string[];
}

// Export the orchestrator instance
export const enhancedDataOrchestrator = new EnhancedDataOrchestrator(); 