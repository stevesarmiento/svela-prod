import { streamText } from 'ai';
import { gemini } from '@/lib/gemini';
import { enhancedIntentDetector } from '@/lib/enhanced-intent-detector';
import { enhancedDataOrchestrator } from '@/lib/enhanced-data-orchestrator';
import type { 
  EnhancedChatResponse, 
  EnhancedDataContext, 
  ChatComponent,
  EnhancedChatIntent
} from '@/types/enhanced-chat';
import type { CoinMarketData } from '@/types/coins';

export class EnhancedChatHandler {
  
  /**
   * Main chat processing pipeline
   */
  async processChat(userMessage: string): Promise<EnhancedChatResponse> {
    const startTime = Date.now();
    
    try {
      console.log('🚀 Starting enhanced chat processing for:', userMessage);
      
      // Stage 1: Enhanced Intent Detection
      const intent = await enhancedIntentDetector.detectIntent(userMessage);
      console.log('📊 Intent detected:', {
        type: intent.type,
        coins: intent.coins,
        timeframe: intent.timeframe,
        dataTypes: intent.dataTypes,
        analysisDepth: intent.analysisDepth,
        confidence: intent.confidence
      });
      
      // Stage 2: Data Orchestration
      const dataContext = await enhancedDataOrchestrator.orchestrateDataFetch(intent);
      console.log('💾 Data orchestration completed:', {
        sources: dataContext.metadata.sources,
        quality: dataContext.metadata.quality,
        coverage: dataContext.metadata.coverage,
        fetchTime: dataContext.metadata.fetchTime
      });
      
      // Log detailed data received
      console.log('📈 Raw data received:');
      if (dataContext.priceData) {
        console.log('  • Price Data:', {
          name: dataContext.priceData.name,
          symbol: dataContext.priceData.symbol,
          price: dataContext.priceData.price,
          change24h: dataContext.priceData.priceChange24h,
          marketCap: dataContext.priceData.marketCap,
          volume24h: dataContext.priceData.volume24h
        });
      }

      // Stage 3: Check if this requires dynamic chart generation
      console.log('🔍 Debug data for chart generation decision:', {
        hasComparisonData: !!dataContext.comparisonData,
        comparisonCoinsCount: dataContext.comparisonData?.coins?.length || 0,
        hasPriceData: !!dataContext.priceData,
        intentType: intent.type,
        originalQuery: userMessage.toLowerCase()
      });
      
      const shouldGenerateChart = this.shouldGenerateChart(intent, dataContext);
      
      if (shouldGenerateChart) {
        console.log('🎨 Triggering v0 chart generation...');
        
        // Generate chart using v0 Platform API
        const chartResult = await this.generateDynamicChart(userMessage, dataContext);
        
        if (chartResult.success) {
          console.log('✅ Dynamic chart generated successfully');
          
          return {
            textResponse: `I've generated a custom chart for your query: "${userMessage}". This chart is optimized for your specific data and requirements.`,
            components: [{
              id: 'generated-chart-1',
              type: 'line_chart',
              priority: 1,
              size: 'large',
              title: 'Generated Chart',
              data: (chartResult.component as Record<string, unknown>) || {},
              metadata: {
                dataSource: 'v0-chart-generator',
                lastUpdated: Date.now(),
                reliability: 'high' as const
              }
            }],
            dataContext,
            processingTime: Date.now() - startTime
          };
        } else {
          console.warn('⚠️ Chart generation failed, falling back to standard components');
          // Fall through to standard component generation
        }
      }

      // Stage 4: Standard component generation (existing logic)
      const components = await this.generateStandardComponents(intent, dataContext);
      
      // Stage 5: Generate AI response
      const textResponse = await this.generateAIResponse(userMessage, dataContext);
      
      console.log(`✅ Enhanced chat processing completed in ${Date.now() - startTime}ms`);
      
      return {
        components,
        textResponse,
        dataContext,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('❌ Enhanced chat processing failed:', error);
      
            // Fallback to basic response
    return {
        components: [],
        textResponse: "I encountered an issue processing your request. Please try again or rephrase your question.",
        dataContext: {
          intent: {
            type: 'none',
            coins: [],
            timeframe: null,
            dataTypes: [],
            analysisDepth: 'quick',
            intent: '',
            keywords: [],
            confidence: 0
          } as EnhancedChatIntent,
      metadata: {
            sources: [],
            fetchTime: 0,
            quality: 'low' as const,
            coverage: 0
          }
        },
        processingTime: Date.now() - startTime
    };
    }
  }

  /**
   * Determine if a query should trigger dynamic chart generation
   */
  private shouldGenerateChart(intent: EnhancedChatIntent, dataContext: EnhancedDataContext): boolean {
    console.log('🔍 Checking if should generate chart:', {
      intentType: intent.type,
      analysisDepth: intent.analysisDepth,
      visualizationType: intent.visualizationType,
      originalQuery: intent.intent,
      dataTypesIncludesTechnical: intent.dataTypes.includes('technical')
    });

    // Check the original user query for chart generation keywords
    const originalQuery = intent.intent?.toLowerCase() || '';
    const chartKeywords = ['generate', 'create', 'build', 'chart', 'custom', 'advanced', 'detailed', 'visualization', 'visual', 'against', 'vs', 'versus', 'compare', 'comparison'];
    const hasChartKeywords = chartKeywords.some(keyword => originalQuery.includes(keyword));
    
    if (hasChartKeywords) {
      console.log('✅ Chart generation triggered by keywords:', originalQuery);
      return true;
    }

    // Generate charts for complex queries that don't fit standard components
    if (intent.visualizationType?.includes('comprehensive_analysis')) {
      console.log('✅ Chart generation triggered by comprehensive_analysis visualization type');
      return true;
    }
    
    // Generate charts for comparison queries with multiple coins (lowered threshold)
    if (intent.type === 'comparison' && dataContext.comparisonData?.coins && dataContext.comparisonData.coins.length > 1) {
      console.log('✅ Chart generation triggered by comparison with multiple coins');
      return true;
    }
    
    // Generate charts for any technical analysis requests
    if (intent.dataTypes.includes('technical')) {
      console.log('✅ Chart generation triggered by technical analysis request');
      return true;
    }

    // Generate charts for detailed analysis requests
    if (intent.analysisDepth === 'comprehensive') {
      console.log('✅ Chart generation triggered by comprehensive analysis depth');
      return true;
    }

    // Fallback: Generate charts for any comparison intent (even without perfect data)
    if (intent.type === 'comparison') {
      console.log('✅ Chart generation triggered by comparison intent (fallback)');
      return true;
    }
    
    console.log('❌ No chart generation trigger found');
    return false;
  }

  /**
   * Generate dynamic chart using v0 Platform API
   */
  private async generateDynamicChart(userMessage: string, dataContext: EnhancedDataContext): Promise<{success: boolean; error?: string; component?: unknown; meta?: unknown; usage?: unknown}> {
    try {
      // Prepare coin data for v0 API
      const coinData = this.prepareCoinDataForV0(dataContext);
      
      if (!coinData || coinData.length === 0) {
        throw new Error('No coin data available for chart generation');
      }

      // Call our v0 chart generation API
      const response = await fetch('/api/v0/generate-chart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage,
          coinData,
          options: {
            chartType: 'custom',
            timeframe: '24h'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Chart generation API failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Chart generation failed');
      }

      return result;
      
    } catch (error) {
      console.error('❌ Dynamic chart generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Convert enhanced data context to coin data format expected by v0 API
   */
  private prepareCoinDataForV0(dataContext: EnhancedDataContext): Partial<CoinMarketData>[] {
    const coinData = [];

        // Add primary coin if available
    if (dataContext.priceData) {
      coinData.push({
        id: dataContext.priceData.id || 1,
        name: dataContext.priceData.name || 'Unknown',
        symbol: dataContext.priceData.symbol || 'UNKNOWN',
        slug: (dataContext.priceData.symbol || 'unknown').toLowerCase(),
        cmc_rank: dataContext.priceData.rank || 0,
        circulating_supply: 0,
        max_supply: null,
        quote: {
          USD: {
            price: dataContext.priceData.price || 0,
            percent_change_24h: dataContext.priceData.priceChange24h || 0,
            market_cap: dataContext.priceData.marketCap || 0,
            volume_24h: dataContext.priceData.volume24h || 0
          }
        }
      });
  }

    // Add comparison coins if available
    if (dataContext.comparisonData?.coins && Array.isArray(dataContext.comparisonData.coins)) {
      dataContext.comparisonData.coins.forEach(coin => {
        coinData.push({
          id: coin.id || Math.random(),
          name: coin.name || 'Unknown',
          symbol: coin.symbol || 'UNKNOWN',
          slug: (coin.symbol || 'unknown').toLowerCase(),
          cmc_rank: coin.rank || 0,
          circulating_supply: 0,
          max_supply: null,
          quote: {
            USD: {
              price: coin.price || 0,
              percent_change_24h: coin.priceChange24h || 0,
              market_cap: coin.marketCap || 0,
              volume_24h: coin.volume24h || 0
            }
          }
        });
      });
    }

    return coinData;
  }

  /**
   * Generate standard components (existing method - simplified)
   */
  private async generateStandardComponents(intent: EnhancedChatIntent, dataContext: EnhancedDataContext): Promise<ChatComponent[]> {
    const components: ChatComponent[] = [];

    // Add price card if we have price data
    if (dataContext.priceData && intent.type === 'coin') {
      components.push({
        id: 'price-card-1',
        type: 'price_card',
        priority: 1,
        size: 'medium',
        title: `${dataContext.priceData.name} Price`,
        data: {
          id: dataContext.priceData.id,
          name: dataContext.priceData.name,
          symbol: dataContext.priceData.symbol,
          price: dataContext.priceData.price,
          change24h: dataContext.priceData.priceChange24h,
          marketCap: dataContext.priceData.marketCap,
          volume24h: dataContext.priceData.volume24h,
          rank: dataContext.priceData.rank,
          historical: dataContext.historicalData?.prices || undefined
        },
        metadata: {
          dataSource: 'enhanced-data-orchestrator',
          lastUpdated: Date.now(),
          reliability: 'high' as const
        }
      });
    }
    
    // Add comparison chart if we have multiple coins
    if (intent.type === 'comparison' && dataContext.comparisonData?.coins && dataContext.comparisonData.coins.length > 1) {
      components.push({
        id: 'comparison-chart-1',
        type: 'comparison_chart',
        priority: 2,
        size: 'large',
        title: 'Cryptocurrency Comparison',
        data: {
          coins: dataContext.comparisonData.coins.map(coin => ({
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            price: coin.price || 0,
            change24h: coin.priceChange24h || 0,
            marketCap: coin.marketCap || 0,
            volume24h: coin.volume24h || 0,
            rank: coin.rank || 0
          })),
          timeframe: '24h'
        },
        metadata: {
          dataSource: 'enhanced-data-orchestrator',
          lastUpdated: Date.now(),
          reliability: 'high' as const
        }
      });
    }

    return components;
  }

  /**
   * Generate AI response (existing method - simplified)
   */
  private async generateAIResponse(userMessage: string, dataContext: EnhancedDataContext): Promise<string> {
    if (!gemini) {
      return "I have the information you requested, but I'm unable to generate a detailed response at the moment.";
    }

    try {
      const contextSummary = this.buildContextSummary(dataContext);
      
      const result = await streamText({
        model: gemini.chat('gemini-1.5-flash'),
        messages: [
          {
            role: 'system',
            content: `You are a helpful cryptocurrency assistant. Use the provided data context to give informed, accurate responses about cryptocurrency markets. Be concise but informative.`
          },
          {
            role: 'user',
            content: `${userMessage}\n\nContext: ${contextSummary}`
          }
        ],
        temperature: 0.7,
        maxTokens: 300
      });

      let response = '';
      for await (const chunk of result.textStream) {
        response += chunk;
      }

      return response;
      
    } catch (error) {
      console.error('❌ AI response generation failed:', error);
      return "I have the information you requested. Please let me know if you need any specific details about the data.";
    }
  }

  /**
   * Build context summary for AI
   */
  private buildContextSummary(dataContext: EnhancedDataContext): string {
    const parts = [];

    if (dataContext.priceData) {
      parts.push(`${dataContext.priceData.name} (${dataContext.priceData.symbol}): $${dataContext.priceData.price} (${dataContext.priceData.priceChange24h > 0 ? '+' : ''}${dataContext.priceData.priceChange24h.toFixed(2)}%)`);
    }

    if (dataContext.comparisonData?.coins && dataContext.comparisonData.coins.length > 1) {
      parts.push(`Comparing ${dataContext.comparisonData.coins.length} cryptocurrencies`);
    }

    if (dataContext.metadata.sources.length > 0) {
      parts.push(`Data sources: ${dataContext.metadata.sources.join(', ')}`);
    }

    return parts.join('. ');
  }
}

// Export singleton instance
export const enhancedChatHandler = new EnhancedChatHandler(); 