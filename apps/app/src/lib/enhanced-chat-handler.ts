import { streamText } from 'ai';
import { gemini } from '@/lib/gemini';
import { enhancedIntentDetector } from '@/lib/enhanced-intent-detector';
import { enhancedDataOrchestrator } from '@/lib/enhanced-data-orchestrator';
import type { 
  EnhancedChatResponse, 
  EnhancedDataContext, 
  ChatComponent,
  VisualizationType
} from '@/types/enhanced-chat';
import { formatLargeNumber } from '@v1/ui/format-numbers';

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
      console.log('📊 Intent detected:', intent);
      
      // Stage 2: Data Orchestration
      const dataContext = await enhancedDataOrchestrator.orchestrateDataFetch(intent);
      console.log('💾 Data orchestration completed:', {
        sources: dataContext.metadata.sources,
        quality: dataContext.metadata.quality,
        coverage: dataContext.metadata.coverage
      });
      
      // Stage 3: Component Generation
      const components = this.generateComponents(dataContext);
      console.log('🎨 Generated components:', components.map(c => c.type));
      
      // Stage 4: AI Response Generation
      const textResponse = await this.generateAIResponse(userMessage, dataContext);
      
      // Stage 5: Follow-up Suggestions
      const followUpSuggestions = this.generateFollowUpSuggestions(intent, dataContext);
      
      const response: EnhancedChatResponse = {
        textResponse,
        components,
        followUpSuggestions,
        dataContext,
        processingTime: Date.now() - startTime
      };
      
      console.log(`✅ Enhanced chat processing completed in ${response.processingTime}ms`);
      return response;
      
    } catch (error) {
      console.error('❌ Enhanced chat processing failed:', error);
      return this.createErrorResponse(userMessage, startTime, error);
    }
  }

  /**
   * Generate visual components based on data context
   */
  private generateComponents(dataContext: EnhancedDataContext): ChatComponent[] {
    const components: ChatComponent[] = [];
    const { intent, priceData, historicalData, marketStructureData } = dataContext;
    
    // Priority 1: Price card for coin queries
    if (priceData && (intent.type === 'coin' || intent.dataTypes.includes('price'))) {
      components.push(this.createPriceCard(priceData));
    }
    
    // Priority 2: Historical chart for temporal queries
    if (historicalData && intent.timeframe && intent.timeframe !== '1d') {
      const chartType = this.determineChartType(intent.visualizationType);
      components.push(this.createHistoricalChart(historicalData, chartType));
    }
    
    // Priority 3: Market structure analysis
    if (marketStructureData && intent.dataTypes.some(dt => 
      ['market_structure', 'funding', 'liquidations', 'open_interest'].includes(dt)
    )) {
      components.push(this.createMarketStructureCard(marketStructureData));
    }
    
    // Priority 4: Technical analysis (if requested)
    if (intent.dataTypes.includes('technical') || intent.type === 'analysis') {
      components.push(this.createTechnicalAnalysisPlaceholder(intent));
    }
    
    // Sort by priority and return
    return components.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Create price card component
   */
  private createPriceCard(priceData: NonNullable<EnhancedDataContext['priceData']>): ChatComponent {
    return {
      id: `price-card-${priceData.id}`,
      type: 'price_card',
      priority: 1,
      size: 'medium',
      title: `${priceData.name} Price`,
      subtitle: priceData.symbol.toUpperCase(),
      data: {
        id: priceData.id,
        name: priceData.name,
        symbol: priceData.symbol,
        price: priceData.price,
        change24h: priceData.priceChange24h,
        marketCap: priceData.marketCap,
        volume24h: priceData.volume24h,
        rank: priceData.rank
      },
      metadata: {
        dataSource: 'CoinMarketCap',
        lastUpdated: Date.now(),
        reliability: 'high'
      }
    };
  }

  /**
   * Create historical chart component
   */
  private createHistoricalChart(
    historicalData: NonNullable<EnhancedDataContext['historicalData']>, 
    chartType: VisualizationType
  ): ChatComponent {
    return {
      id: `chart-${historicalData.coinId}-${historicalData.timeframe}`,
      type: chartType,
      priority: 2,
      size: 'large',
      title: `Price History (${historicalData.timeframe})`,
      data: {
        coinId: historicalData.coinId,
        timeframe: historicalData.timeframe,
        prices: historicalData.prices,
        volumes: historicalData.volumes
      },
      metadata: {
        dataSource: 'CoinMarketCap',
        lastUpdated: Date.now(),
        reliability: 'high'
      }
    };
  }

  /**
   * Create market structure analysis card
   */
  private createMarketStructureCard(
    marketData: NonNullable<EnhancedDataContext['marketStructureData']>
  ): ChatComponent {
    return {
      id: `market-structure-${marketData.coinId}`,
      type: 'market_structure',
      priority: 3,
      size: 'medium',
      title: 'Market Structure Analysis',
      data: {
        coinId: marketData.coinId,
        fundingRate: marketData.fundingRate,
        openInterest: marketData.openInterest,
        liquidations: marketData.liquidations,
        orderFlow: marketData.orderFlow
      },
      metadata: {
        dataSource: 'Coinalyze, CoinGlass',
        lastUpdated: Date.now(),
        reliability: 'high'
      }
    };
  }

  /**
   * Create technical analysis placeholder (would integrate with existing analysis system)
   */
  private createTechnicalAnalysisPlaceholder(intent: EnhancedDataContext['intent']): ChatComponent {
    return {
      id: `technical-analysis-${Date.now()}`,
      type: 'technical_analysis',
      priority: 4,
      size: 'large',
      title: 'Technical Analysis',
      subtitle: `${intent.analysisDepth} analysis`,
      data: {
        note: 'Technical analysis integration pending - would use existing analysis hooks'
      },
      metadata: {
        dataSource: 'Multiple Sources',
        lastUpdated: Date.now(),
        reliability: 'medium'
      }
    };
  }

  /**
   * Determine appropriate chart type based on visualization preferences
   */
  private determineChartType(visualizationTypes?: VisualizationType[]): VisualizationType {
    if (!visualizationTypes || visualizationTypes.length === 0) {
      return 'line_chart';
    }
    
    // Priority order for chart types
    const chartPriority: VisualizationType[] = [
      'candlestick_chart',
      'line_chart',
      'volume_chart'
    ];
    
    for (const preferred of chartPriority) {
      if (visualizationTypes.includes(preferred)) {
        return preferred;
      }
    }
    
    return 'line_chart';
  }

  /**
   * Generate AI response using enhanced context
   */
  private async generateAIResponse(
    userMessage: string, 
    dataContext: EnhancedDataContext
  ): Promise<string> {
    
    if (!gemini) {
      return this.generateFallbackResponse(dataContext);
    }

    const systemPrompt = this.createEnhancedSystemPrompt(dataContext);
    const contextualMessage = this.formatDataContextForAI(userMessage, dataContext);

    try {
      const result = await streamText({
        model: gemini('gemini-2.5-flash'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextualMessage }
        ],
        temperature: 0.3,
        maxTokens: 1000,
      });

      // Get complete response
      let fullResponse = '';
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
      }
      
      return fullResponse;
      
    } catch (error) {
      console.error('AI response generation failed:', error);
      return this.generateFallbackResponse(dataContext);
    }
  }

  /**
   * Create enhanced system prompt based on data context
   */
  private createEnhancedSystemPrompt(dataContext: EnhancedDataContext): string {
    const { intent, metadata } = dataContext;
    
    let prompt = `You are a sophisticated cryptocurrency analyst with access to real-time market data. 

**FORMATTING REQUIREMENTS:**
- Format your response using **Markdown** for better readability
- Use **## headers** for main sections
- Use **### subheaders** for subsections  
- Use **bold** for important numbers and key insights
- Use *italics* for emphasis and trends
- Use bullet points (-) for lists
- Use \`inline code\` for technical terms and indicators
- Keep responses well-structured and scannable

**CONTEXT:**
- Query Type: ${intent.type}
- Analysis Depth: ${intent.analysisDepth}
- Data Sources: ${metadata.sources.join(', ')}
- Data Quality: ${metadata.quality}
- Data Coverage: ${Math.round(metadata.coverage * 100)}%

**CAPABILITIES:**
- Real-time price and volume data
- Historical price analysis
- Market structure insights (funding rates, liquidations, open interest)
- Technical indicators and signals
- Cross-asset comparisons

**GUIDELINES:**
1. Focus on the specific intent: ${intent.intent}
2. Use the provided real-time data for accuracy
3. Highlight key insights from market structure data when available
4. Adjust detail level based on analysis depth (${intent.analysisDepth})
5. Be concise but comprehensive
6. Note any data limitations or gaps

Since visual components will also be shown, focus your text response on insights and analysis rather than just stating numbers.`;

    // Add specific guidance based on intent type
    switch (intent.type) {
      case 'analysis':
        prompt += '\n\nFocus on technical and fundamental analysis, market trends, and actionable insights.';
        break;
      case 'comparison':
        prompt += '\n\nProvide comparative analysis highlighting relative strengths, correlations, and performance differences.';
        break;
      case 'market':
        prompt += '\n\nProvide market overview with focus on trends, leaders, and overall market sentiment.';
        break;
      default:
        prompt += '\n\nProvide clear, relevant information matching the user\'s specific request.';
    }

    return prompt;
  }

  /**
   * Format data context for AI consumption
   */
  private formatDataContextForAI(userMessage: string, dataContext: EnhancedDataContext): string {
    const { priceData, historicalData, marketStructureData } = dataContext;
    
    let context = `User Query: "${userMessage}"\n\nLIVE DATA CONTEXT:\n`;
    
    // Price data context
    if (priceData) {
      context += `\n**${priceData.name} (${priceData.symbol})**\n`;
      context += `- Current Price: $${priceData.price.toLocaleString()}\n`;
      context += `- 24h Change: ${priceData.priceChange24h.toFixed(2)}%\n`;
      context += `- Market Cap: $${formatLargeNumber(priceData.marketCap)}\n`;
      context += `- 24h Volume: $${formatLargeNumber(priceData.volume24h)}\n`;
      context += `- Rank: #${priceData.rank}\n`;
    }
    
    // Historical context
    if (historicalData && historicalData.prices.length > 0) {
      const prices = historicalData.prices;
      const oldestPrice = prices[0]?.price || 0;
      const newestPrice = prices[prices.length - 1]?.price || 0;
      const change = oldestPrice > 0 ? ((newestPrice - oldestPrice) / oldestPrice) * 100 : 0;
      
      context += `\n**Historical Performance (${historicalData.timeframe})**\n`;
      context += `- Period Change: ${change.toFixed(2)}%\n`;
      context += `- Data Points: ${prices.length} price points\n`;
    }
    
    // Market structure context
    if (marketStructureData) {
      context += `\n**Market Structure Analysis**\n`;
      
      if (marketStructureData.fundingRate) {
        context += `- Funding Rate: ${(marketStructureData.fundingRate.current * 100).toFixed(4)}%\n`;
      }
      
      if (marketStructureData.liquidations) {
        const { longs24h, shorts24h, total24h } = marketStructureData.liquidations;
        context += `- 24h Liquidations: $${formatLargeNumber(total24h)} (${formatLargeNumber(longs24h)} longs, ${formatLargeNumber(shorts24h)} shorts)\n`;
      }
      
      if (marketStructureData.openInterest) {
        context += `- Open Interest: $${formatLargeNumber(marketStructureData.openInterest.current)}\n`;
      }
      
      if (marketStructureData.orderFlow) {
        const { buyPressure, sellPressure, netFlow } = marketStructureData.orderFlow;
        context += `- Order Flow: ${buyPressure.toFixed(1)}% buy / ${sellPressure.toFixed(1)}% sell (${netFlow})\n`;
      }
    }
    
    context += '\nProvide insights and analysis based on this real-time data.';
    
    return context;
  }

  /**
   * Generate fallback response when AI is not available
   */
  private generateFallbackResponse(dataContext: EnhancedDataContext): string {
    const { intent, priceData } = dataContext;
    
    if (priceData) {
      const changeEmoji = priceData.priceChange24h >= 0 ? '📈' : '📉';
      return `${changeEmoji} ${priceData.name} is currently trading at $${priceData.price.toLocaleString()} with a 24h change of ${priceData.priceChange24h.toFixed(2)}%. Market cap: $${formatLargeNumber(priceData.marketCap)}.`;
    }
    
    return `I've gathered the requested data for your ${intent.type} query. Please check the visual components for detailed information.`;
  }

  /**
   * Generate follow-up suggestions based on context
   */
  private generateFollowUpSuggestions(
    intent: EnhancedDataContext['intent'], 
    dataContext: EnhancedDataContext
  ): string[] {
    const suggestions: string[] = [];
    const coinName = dataContext.priceData?.name || 'this asset';
    
    // Suggestions based on intent type
    switch (intent.type) {
      case 'coin':
        suggestions.push(
          `Show me technical analysis for ${coinName}`,
          `Compare ${coinName} with Ethereum`,
          `What's the funding rate for ${coinName}?`
        );
        break;
      case 'analysis':
        suggestions.push(
          `Show me liquidation data for ${coinName}`,
          `What's the market sentiment for ${coinName}?`,
          `Compare this with Bitcoin`
        );
        break;
      case 'comparison':
        suggestions.push(
          'Show me the correlation between these assets',
          'What are the key differences in performance?',
          'Which one has better technical indicators?'
        );
        break;
      default:
        suggestions.push(
          'Show me today\'s market leaders',
          'What are the most liquidated coins?',
          'Give me a technical analysis of Bitcoin'
        );
    }
    
    // Add timeframe suggestions if not already specified
    if (!intent.timeframe || intent.timeframe === '1d') {
      suggestions.push(`Show me ${coinName} over the last 7 days`);
    }
    
    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    userMessage: string, 
    startTime: number, 
    error: unknown
  ): EnhancedChatResponse {
    console.error('Enhanced chat error for query:', userMessage, error);
    
    return {
      textResponse: `I encountered an issue processing your request. Please try rephrasing your question or try again in a moment.`,
      components: [],
      followUpSuggestions: [
        'What is Bitcoin doing today?',
        'Show me Ethereum technical analysis',
        'Compare BTC and ETH performance'
      ],
      dataContext: {
        intent: {
          type: 'none',
          coins: [],
          timeframe: null,
          dataTypes: [],
          analysisDepth: 'quick',
          intent: 'Error processing request',
          keywords: [],
          confidence: 0
        },
        metadata: {
          sources: [],
          fetchTime: Date.now() - startTime,
          quality: 'low',
          coverage: 0
        }
      },
      processingTime: Date.now() - startTime
    };
  }
}

// Export singleton instance
export const enhancedChatHandler = new EnhancedChatHandler(); 