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
  coinId: number;
  name: string;
  symbol: string;
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
      // Step 1: Resolve coin names to IDs
      const coinIds = await this.resolveCoinIds(intent.coins);
      
      // Step 2: Plan data fetching strategy
      const fetchPlan = this.createFetchPlan(intent, coinIds);
      
      // Step 3: Execute parallel data fetching
      const dataResults = await this.executeFetchPlan(fetchPlan);
      
      // Step 4: Assemble final data context
      const dataContext = this.assembleDataContext(intent, dataResults, startTime);
      
      console.log(`Data orchestration completed in ${Date.now() - startTime}ms`);
      return dataContext;
      
    } catch (error) {
      console.error('Data orchestration failed:', error);
      return this.createEmptyDataContext(intent, startTime);
    }
  }

  /**
   * Resolve coin names/symbols to database IDs
   */
  private async resolveCoinIds(coinNames: string[]): Promise<Array<{ id: number; name: string; symbol: string }>> {
    if (coinNames.length === 0) return [];

    try {
      const searchPromises = coinNames.map(coin => this.searchCoinInDatabase(coin));
      const searchResults = await Promise.all(searchPromises);
      
      // Flatten and deduplicate results
      const resolvedCoins = new Map<number, { id: number; name: string; symbol: string }>();
      
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
   * Search for coin in database
   */
  private async searchCoinInDatabase(query: string): Promise<{ id: number; name: string; symbol: string } | null> {
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
    coinIds: Array<{ id: number; name: string; symbol: string }>
  ): FetchPlan {
    const plan: FetchPlan = {
      priceData: [],
      historicalData: [],
      technicalData: [],
      marketStructureData: [],
      comparisonData: null
    };

    // Plan price data fetching
    if (intent.dataTypes.includes('price') || intent.type === 'coin') {
      plan.priceData = coinIds.map(coin => ({
        coinId: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        endpoints: ['quotes']
      }));
    }

    // Plan historical data fetching
    if (intent.dataTypes.includes('historical') || intent.timeframe) {
      plan.historicalData = coinIds.map(coin => ({
        coinId: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        timeframe: intent.timeframe || '30d',
        endpoints: ['historical', 'ohlcv']
      }));
    }

    // Plan technical analysis data fetching
    if (intent.dataTypes.includes('technical') || intent.type === 'analysis') {
      plan.technicalData = coinIds.map(coin => ({
        coinId: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        timeframe: intent.timeframe || '30d',
        endpoints: ['charts', 'technical']
      }));
    }

    // Plan market structure data fetching
    if (intent.dataTypes.some(dt => ['market_structure', 'funding', 'liquidations', 'open_interest'].includes(dt))) {
      plan.marketStructureData = coinIds.map(coin => ({
        coinId: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        endpoints: this.getMarketStructureEndpoints(intent.dataTypes)
      }));
    }

    // Plan comparison data (if multiple coins or comparison type)
    if (intent.type === 'comparison' || coinIds.length > 1) {
      plan.comparisonData = {
        coinIds: coinIds.map(c => c.id),
        timeframe: intent.timeframe || '7d',
        metrics: ['performance', 'correlation']
      };
    }

    return plan;
  }

  /**
   * Determine which market structure endpoints to call
   */
  private getMarketStructureEndpoints(dataTypes: string[]): string[] {
    const endpoints: string[] = [];
    
    if (dataTypes.includes('funding')) endpoints.push('funding-rate');
    if (dataTypes.includes('liquidations')) endpoints.push('liquidations');
    if (dataTypes.includes('open_interest')) endpoints.push('open-interest');
    if (dataTypes.includes('market_structure')) {
      endpoints.push('funding-rate', 'liquidations', 'open-interest', 'taker-buy-sell');
    }
    
    return endpoints;
  }

  /**
   * Execute the fetch plan with parallel requests
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

    // Fetch price data
    if (plan.priceData.length > 0) {
      promises.push(this.fetchPriceData(plan.priceData, results));
    }

    // Fetch historical data
    if (plan.historicalData.length > 0) {
      promises.push(this.fetchHistoricalData(plan.historicalData, results));
    }

    // Fetch technical data
    if (plan.technicalData.length > 0) {
      promises.push(this.fetchTechnicalData(plan.technicalData, results));
    }

    // Fetch market structure data
    if (plan.marketStructureData.length > 0) {
      promises.push(this.fetchMarketStructureData(plan.marketStructureData, results));
    }

    // Fetch comparison data
    if (plan.comparisonData) {
      promises.push(this.fetchComparisonData(plan.comparisonData, results));
    }

    // Execute all fetches in parallel
    await Promise.allSettled(promises);

    return results;
  }

  /**
   * Fetch price data for coins
   */
  private async fetchPriceData(
    priceTargets: Array<{ coinId: number; name: string; symbol: string }>,
    results: FetchResults
  ): Promise<void> {
    try {
      const coinIds = priceTargets.map(t => t.coinId).join(',');
      const response = await fetch(`${this.baseUrl}/api/coinmarketcap/quotes?ids=${coinIds}`);
      
      if (!response.ok) throw new Error('Failed to fetch price data');
      
      const data = await response.json();
      
      priceTargets.forEach(target => {
        const coinData = data.data[target.coinId];
        if (coinData) {
          results.priceData.push(this.transformToPriceData(coinData, target));
        }
      });
      
    } catch (error) {
      console.error('Price data fetch failed:', error);
      results.errors.push(`Price data: ${error}`);
    }
  }

  /**
   * Fetch historical data for coins
   */
  private async fetchHistoricalData(
    historicalTargets: Array<{ coinId: number; name: string; symbol: string; timeframe: string }>,
    results: FetchResults
  ): Promise<void> {
    try {
      const promises = historicalTargets.map(async (target) => {
        try {
          const response = await fetch(
            `${this.baseUrl}/api/coins/${target.coinId}?timeScale=${target.timeframe}`
          );
          
          if (!response.ok) throw new Error(`Failed to fetch historical data for ${target.symbol}`);
          
          const data = await response.json();
          const historicalData = this.transformToHistoricalData(data, target);
          
          if (historicalData) {
            results.historicalData.push(historicalData);
          }
        } catch (error) {
          console.error(`Historical data fetch failed for ${target.symbol}:`, error);
          results.errors.push(`Historical data for ${target.symbol}: ${error}`);
        }
      });

      await Promise.all(promises);
    } catch (error) {
      console.error('Historical data batch fetch failed:', error);
      results.errors.push(`Historical data batch: ${error}`);
    }
  }

  /**
   * Fetch technical analysis data
   */
  private async fetchTechnicalData(
    technicalTargets: Array<{ coinId: number; name: string; symbol: string; timeframe: string }>,
    results: FetchResults
  ): Promise<void> {
    try {
      const promises = technicalTargets.map(async (target) => {
        try {
          // Use existing analysis endpoint
          const response = await fetch(`${this.baseUrl}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: target.name,
              symbol: target.symbol,
              quote: { USD: { price: 0, percent_change_24h: 0 } }, // Placeholder
              timeframe: target.timeframe
            })
          });
          
          if (response.ok) {
            await response.text(); // Consume response
            results.technicalData.push({
              coinId: target.coinId,
              indicators: {}, // Would be populated from analysis
              signals: { overall: 'neutral', strength: 'moderate', confidence: 0.5 },
              trends: { short: 'sideways', medium: 'sideways', long: 'sideways' }
            });
          }
        } catch (error) {
          console.error(`Technical analysis failed for ${target.symbol}:`, error);
          results.errors.push(`Technical analysis for ${target.symbol}: ${error}`);
        }
      });
      
      await Promise.all(promises);
    } catch (error) {
      console.error('Technical data batch fetch failed:', error);
      results.errors.push(`Technical data batch: ${error}`);
    }
  }

  /**
   * Fetch market structure data
   */
  private async fetchMarketStructureData(
    marketTargets: Array<{ coinId: number; name: string; symbol: string; endpoints: string[] }>,
    results: FetchResults
  ): Promise<void> {
    const promises = marketTargets.map(async (target) => {
      const marketData: Partial<MarketStructureData> = { coinId: target.coinId };
      
      // Parallel fetch of market structure endpoints
      const endpointPromises = target.endpoints.map(async (endpoint) => {
        try {
          let apiPath = '';
          switch (endpoint) {
            case 'funding-rate':
              apiPath = `/api/coinalyze/fundingrate?cmcId=${target.coinId}`;
              break;
            case 'liquidations':
              apiPath = `/api/coinalyze/liquidations?cmcId=${target.coinId}`;
              break;
            case 'open-interest':
              apiPath = `/api/coinalyze/open-interest?cmcId=${target.coinId}`;
              break;
            case 'taker-buy-sell':
              apiPath = `/api/coinglass/taker-buy-sell/exchange-list?coinId=${target.coinId}`;
              break;
            default:
              return;
          }
          
          const response = await fetch(`${this.baseUrl}${apiPath}`);
          if (!response.ok) throw new Error(`Failed to fetch ${endpoint}`);
          
          const data = await response.json();
          this.integrateMarketStructureData(marketData, endpoint, data);
          
        } catch (error) {
          console.error(`Market structure ${endpoint} fetch failed for ${target.symbol}:`, error);
          results.errors.push(`${endpoint} for ${target.symbol}: ${error}`);
        }
      });
      
      await Promise.allSettled(endpointPromises);
      
      if (Object.keys(marketData).length > 1) { // More than just coinId
        results.marketStructureData.push(marketData as MarketStructureData);
      }
    });
    
    await Promise.all(promises);
  }

  /**
   * Fetch comparison data
   */
  private async fetchComparisonData(
    comparisonTarget: { coinIds: number[]; timeframe: string; metrics: string[] },
    results: FetchResults
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { coinIds, timeframe, metrics } = comparisonTarget;
    // Implementation would depend on your comparison requirements
    console.log('Comparison data fetch not yet implemented');
    // Placeholder to satisfy linter
    results.comparisonData = null;
  }

  /**
   * Transform API response to standardized price data
   */
  private transformToPriceData(
    apiData: Record<string, unknown>, 
    target: { coinId: number; name: string; symbol: string }
  ): CoinPriceData {
    const quote = (apiData.quote as Record<string, Record<string, unknown>>)?.USD || {};
    
    return {
      id: target.coinId,
      name: target.name,
      symbol: target.symbol,
      price: Number(quote.price) || 0,
      priceChange24h: Number(quote.percent_change_24h) || 0,
      priceChange7d: Number(quote.percent_change_7d) || undefined,
      priceChange30d: Number(quote.percent_change_30d) || undefined,
      volume24h: Number(quote.volume_24h) || 0,
      marketCap: Number(quote.market_cap) || 0,
      rank: Number(apiData.cmc_rank) || 0,
      lastUpdated: String(quote.last_updated) || new Date().toISOString()
    };
  }

  /**
   * Transform API response to standardized historical data
   */
  private transformToHistoricalData(
    apiData: Record<string, unknown>,
    target: { coinId: number; name: string; symbol: string; timeframe: string }
  ): CoinHistoricalData | null {
    // Try OHLCV data first
    const ohlcvData = apiData.ohlcv as Record<string, unknown>;
    if (ohlcvData?.data && Array.isArray((ohlcvData.data as Record<string, unknown>).quotes)) {
      const quotes = (ohlcvData.data as Record<string, unknown>).quotes as Array<Record<string, unknown>>;
      
      return {
        coinId: target.coinId,
        timeframe: target.timeframe,
        prices: quotes.map(quote => ({
          timestamp: new Date(quote.time_close as string).getTime(),
          price: Number((quote.quote as Record<string, Record<string, unknown>>)?.USD?.close) || 0
        })),
        volumes: quotes.map(quote => ({
          timestamp: new Date(quote.time_close as string).getTime(),
          volume: Number((quote.quote as Record<string, Record<string, unknown>>)?.USD?.volume) || 0
        }))
      };
    }
    
    // Fallback to historical data
    const historical = apiData.historical as Record<string, unknown>;
    if (historical?.data && Array.isArray((historical.data as Record<string, unknown>).quotes)) {
      const quotes = (historical.data as Record<string, unknown>).quotes as Array<Record<string, unknown>>;
      
      return {
        coinId: target.coinId,
        timeframe: target.timeframe,
        prices: quotes.map(quote => ({
          timestamp: new Date(quote.timestamp as string).getTime(),
          price: Number((quote.quote as Record<string, Record<string, unknown>>)?.USD?.price) || 0
        })),
        volumes: quotes.map(quote => ({
          timestamp: new Date(quote.timestamp as string).getTime(),
          volume: Number((quote.quote as Record<string, Record<string, unknown>>)?.USD?.volume_24h) || 0
        }))
      };
    }
    
    return null;
  }

  /**
   * Integrate market structure data from various endpoints
   */
  private integrateMarketStructureData(
    marketData: Partial<MarketStructureData>,
    endpoint: string,
    data: Record<string, unknown>
  ): void {
    switch (endpoint) {
      case 'funding-rate':
        if (data.currentFundingRate) {
          marketData.fundingRate = {
            current: Number(data.currentFundingRate),
            average24h: Number(data.average24h) || 0,
            trend: 'stable' // Would need to calculate trend
          };
        }
        break;
        
      case 'liquidations':
        if (data.longLiquidations && data.shortLiquidations) {
          const longs = Number(data.longLiquidations);
          const shorts = Number(data.shortLiquidations);
          marketData.liquidations = {
            longs24h: longs,
            shorts24h: shorts,
            total24h: longs + shorts,
            ratio: shorts > 0 ? longs / shorts : 0
          };
        }
        break;
        
      case 'open-interest':
        if (data.currentOpenInterest) {
          marketData.openInterest = {
            current: Number(data.currentOpenInterest),
            change24h: Number(data.change24h) || 0,
            trend: 'stable' // Would need to calculate trend
          };
        }
        break;
        
      case 'taker-buy-sell':
        if (data.data && typeof data.data === 'object') {
          const orderData = data.data as Record<string, unknown>;
          marketData.orderFlow = {
            buyPressure: Number(orderData.buy_ratio) || 0,
            sellPressure: Number(orderData.sell_ratio) || 0,
            netFlow: Number(orderData.buy_ratio) > Number(orderData.sell_ratio) ? 'bullish' : 'bearish'
          };
        }
        break;
    }
  }

  /**
   * Assemble final data context
   */
  private assembleDataContext(
    intent: EnhancedChatIntent,
    results: FetchResults,
    startTime: number
  ): EnhancedDataContext {
    // Calculate data quality and coverage
    const requestedDataTypes = intent.dataTypes.length;
    const fetchedDataTypes = [
      results.priceData.length > 0 ? 1 : 0,
      results.historicalData.length > 0 ? 1 : 0,
      results.technicalData.length > 0 ? 1 : 0,
      results.marketStructureData.length > 0 ? 1 : 0,
      results.comparisonData ? 1 : 0
    ].reduce((a, b) => a + b, 0);
    
    const coverage = requestedDataTypes > 0 ? fetchedDataTypes / requestedDataTypes : 1;
    const quality = results.errors.length === 0 ? 'high' : 
                   results.errors.length < 3 ? 'medium' : 'low';
    
    return {
      intent,
      priceData: results.priceData[0], // For single coin queries
      historicalData: results.historicalData[0], // For single coin queries
      technicalData: results.technicalData[0], // For single coin queries
      marketStructureData: results.marketStructureData[0], // For single coin queries
      comparisonData: results.comparisonData || undefined,
      metadata: {
        sources: this.getDataSources(intent.dataTypes),
        fetchTime: Date.now() - startTime,
        quality,
        coverage
      }
    };
  }

  /**
   * Create empty data context for error cases
   */
  private createEmptyDataContext(intent: EnhancedChatIntent, startTime: number): EnhancedDataContext {
    return {
      intent,
      metadata: {
        sources: [],
        fetchTime: Date.now() - startTime,
        quality: 'low',
        coverage: 0
      }
    };
  }

  /**
   * Get data sources used
   */
  private getDataSources(dataTypes: string[]): string[] {
    const sources = new Set<string>();
    
    if (dataTypes.includes('price')) sources.add('CoinMarketCap');
    if (dataTypes.includes('historical')) sources.add('CoinMarketCap');
    if (dataTypes.includes('funding')) sources.add('Coinalyze');
    if (dataTypes.includes('liquidations')) sources.add('Coinalyze');
    if (dataTypes.includes('open_interest')) sources.add('Coinalyze');
    if (dataTypes.includes('market_structure')) {
      sources.add('Coinalyze');
      sources.add('CoinGlass');
    }
    
    return Array.from(sources);
  }
}

// Internal types for orchestration
interface FetchPlan {
  priceData: Array<{ coinId: number; name: string; symbol: string; endpoints: string[] }>;
  historicalData: Array<{ coinId: number; name: string; symbol: string; timeframe: string; endpoints: string[] }>;
  technicalData: Array<{ coinId: number; name: string; symbol: string; timeframe: string; endpoints: string[] }>;
  marketStructureData: Array<{ coinId: number; name: string; symbol: string; endpoints: string[] }>;
  comparisonData: { coinIds: number[]; timeframe: string; metrics: string[] } | null;
}

interface FetchResults {
  priceData: CoinPriceData[];
  historicalData: CoinHistoricalData[];
  technicalData: TechnicalAnalysisData[];
  marketStructureData: MarketStructureData[];
  comparisonData: ComparisonData | null;
  errors: string[];
}

// Export singleton instance
export const enhancedDataOrchestrator = new EnhancedDataOrchestrator(); 