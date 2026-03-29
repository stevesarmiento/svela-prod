import { streamText } from 'ai';
import { gemini } from '@/lib/gemini';
import { enhancedIntentDetector } from '@/lib/enhanced-intent-detector';
import { enhancedDataOrchestrator } from '@/lib/enhanced-data-orchestrator';
import type { 
  EnhancedChatResponse, 
  EnhancedDataContext, 
  ChatComponent,
  VisualizationType,
  MarketStructureData
} from '@/types/enhanced-chat';
import { formatLargeNumber } from '@v1/ui/format-numbers';
import { getTokenDisplayName } from '@/lib/token-mappings';

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
        confidence: intent.confidence,
        tradeAction: intent.tradeAction
      });
      
      // Handle trading intents immediately
      if (intent.type === 'trade' && intent.tradeAction) {
        console.log('💱 Processing trade intent:', intent.tradeAction);
        const tradeResponse = this.generateTradeResponse(intent.tradeAction, userMessage, startTime);
        console.log('💱 Generated trade response:', {
          componentsCount: tradeResponse.components.length,
          componentType: tradeResponse.components[0]?.type,
          textLength: tradeResponse.textResponse.length
        });
        return tradeResponse;
      }
      
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
          currentPrice: dataContext.priceData.currentPrice,
          priceChangePercentage24h: dataContext.priceData.priceChangePercentage24h,
          marketCap: dataContext.priceData.marketCap,
          totalVolume: dataContext.priceData.totalVolume
        });
      }
      if (dataContext.historicalData) {
        console.log('  • Historical Data:', {
          timeframe: dataContext.historicalData.timeframe,
          pricePoints: dataContext.historicalData.prices?.length || 0,
          volumePoints: dataContext.historicalData.volumes?.length || 0,
          dateRange: dataContext.historicalData.prices?.length > 0 ? {
            start: new Date(dataContext.historicalData.prices[0]?.timestamp || 0).toLocaleDateString(),
            end: new Date(dataContext.historicalData.prices[dataContext.historicalData.prices.length - 1]?.timestamp || 0).toLocaleDateString()
          } : 'No data'
        });
      }
      if (dataContext.marketStructureData) {
        console.log('  • Market Structure Data:', {
          fundingRate: dataContext.marketStructureData.fundingRate?.current,
          liquidations: dataContext.marketStructureData.liquidations?.total24h,
          openInterest: dataContext.marketStructureData.openInterest?.current,
          orderFlow: dataContext.marketStructureData.orderFlow?.netFlow
        });
      }
      
      // Stage 3: Component Generation
      const components = this.generateComponents(dataContext);
      console.log('🎨 Generated components:', components.map(c => ({
        type: c.type,
        title: c.title,
        priority: c.priority,
        size: c.size
      })));
      
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
      console.log("📝 Response summary:", {
        textLength: textResponse.length,
        componentCount: components.length,
        suggestionCount: followUpSuggestions.length
      });
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
    const { intent, priceData, historicalData, marketStructureData, multiCoinData } = dataContext;
    
    // Handle multi-coin comparison data
    if (multiCoinData && intent.type === 'comparison') {
      console.log('🎨 Generating comparison components for multi-coin data');
      
      // Priority 1: Comparison chart with historical data
      if (multiCoinData.historicalData.length > 1) {
        const chartType = this.determineChartType(intent.visualizationType);
        components.push(this.createComparisonChart(multiCoinData, chartType));
      }
      
      // Priority 2: Price cards for each coin
      multiCoinData.priceData.forEach((coinPrice, index) => {
        const priceCard = this.createPriceCard(coinPrice);
        priceCard.priority = 2 + index; // Ensure price cards come after comparison chart
        priceCard.size = 'small'; // Make them smaller in comparison view
        components.push(priceCard);
      });
      
      // Priority 3: Market structure comparison (if available)
      if (multiCoinData.marketStructureData.length > 1) {
        components.push(this.createMarketStructureComparison(multiCoinData.marketStructureData));
      }
      
      // Sort by priority and return
      return components.sort((a, b) => a.priority - b.priority);
    }
    
    // Handle single coin data (existing logic)
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
      id: `price-card-${priceData.coingeckoId}`,
      type: 'price_card',
      priority: 1,
      size: 'medium',
      title: `${priceData.name} Price`,
      subtitle: priceData.symbol.toUpperCase(),
      data: {
        coingeckoId: priceData.coingeckoId,
        name: priceData.name,
        symbol: priceData.symbol,
        currentPrice: priceData.currentPrice,
        priceChangePercentage24h: priceData.priceChangePercentage24h,
        marketCap: priceData.marketCap,
        totalVolume: priceData.totalVolume,
        marketCapRank: priceData.marketCapRank,
        image: priceData.image
      },
      metadata: {
        dataSource: 'CoinGecko',
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
      id: `chart-${historicalData.coingeckoId}-${historicalData.timeframe}`,
      type: chartType,
      priority: 2,
      size: 'large',
      title: `Price History (${historicalData.timeframe})`,
      data: {
        coingeckoId: historicalData.coingeckoId,
        timeframe: historicalData.timeframe,
        prices: historicalData.prices,
        volumes: historicalData.volumes
      },
      metadata: {
        dataSource: 'CoinGecko',
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
      id: `market-structure-${marketData.coingeckoId}`,
      type: 'market_structure',
      priority: 3,
      size: 'medium',
      title: 'Market Structure Analysis',
      data: {
        coingeckoId: marketData.coingeckoId,
        fundingRate: marketData.fundingRate,
        openInterest: marketData.openInterest,
        liquidations: marketData.liquidations,
        orderFlow: marketData.orderFlow
      },
      metadata: {
        dataSource: 'CoinGlass',
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
   * Create comparison chart component for multi-coin data
   */
  private createComparisonChart(
    multiCoinData: NonNullable<EnhancedDataContext['multiCoinData']>,
    chartType: VisualizationType
  ): ChatComponent {
    const coinNames = multiCoinData.priceData.map(coin => coin.symbol).join(' vs ');
    const timeframe = multiCoinData.historicalData[0]?.timeframe || '7d';
    
    return {
      id: `comparison-chart-${Date.now()}`,
      type: 'comparison_chart',
      priority: 1,
      size: 'large',
      title: `${coinNames} Comparison`,
      subtitle: `Performance over ${timeframe}`,
      data: {
        coins: multiCoinData.priceData.map((priceData, index) => ({
          coingeckoId: priceData.coingeckoId,
          name: priceData.name,
          symbol: priceData.symbol,
          currentPrice: priceData.currentPrice,
          priceChangePercentage24h: priceData.priceChangePercentage24h,
          marketCap: priceData.marketCap,
          totalVolume: priceData.totalVolume,
          marketCapRank: priceData.marketCapRank,
          image: priceData.image,
          historical: multiCoinData.historicalData[index] ? {
            timeframe: multiCoinData.historicalData[index].timeframe,
            prices: multiCoinData.historicalData[index].prices,
            volumes: multiCoinData.historicalData[index].volumes
          } : undefined
        })),
        timeframe,
        chartType
      },
      metadata: {
        dataSource: 'CoinGecko',
        lastUpdated: Date.now(),
        reliability: 'high'
      }
    };
  }

  /**
   * Create market structure comparison component
   */
  private createMarketStructureComparison(
    marketStructureData: MarketStructureData[]
  ): ChatComponent {
    const coinNames = marketStructureData.map(data => 
      // We don't have symbol in MarketStructureData, so we'll use coingeckoId
      `Coin ${data.coingeckoId}`
    ).join(' vs ');
    
    return {
      id: `market-structure-comparison-${Date.now()}`,
      type: 'market_structure',
      priority: 10,
      size: 'medium',
      title: "Market Structure Comparison",
      subtitle: coinNames,
      data: {
        comparison: marketStructureData.map(data => ({
          coingeckoId: data.coingeckoId,
          fundingRate: data.fundingRate,
          openInterest: data.openInterest,
          liquidations: data.liquidations,
          orderFlow: data.orderFlow
        }))
      },
      metadata: {
        dataSource: 'CoinGlass',
        lastUpdated: Date.now(),
        reliability: 'high'
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
    console.log('🤖 Starting AI response generation...');
    
    if (!gemini) {
      console.log('❌ Gemini not available, using fallback response');
      return this.generateFallbackResponse(dataContext);
    }

    const systemPrompt = this.createEnhancedSystemPrompt(dataContext);
    const contextualMessage = this.formatDataContextForAI(userMessage, dataContext);

    console.log('📤 Sending to Gemini:', {
      systemPromptLength: systemPrompt.length,
      contextMessageLength: contextualMessage.length,
      model: 'gemini-2.5-flash',
      temperature: 0.3,
      maxTokens: 1000
    });

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

      console.log('📡 Streaming response from Gemini...');
      
      // Get complete response
      let fullResponse = '';
      let chunkCount = 0;
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        chunkCount++;
      }
      
      console.log('✅ AI response received:', {
        responseLength: fullResponse.length,
        chunksReceived: chunkCount,
        hasMarkdown: fullResponse.includes('**') || fullResponse.includes('##'),
        responsePreview: `${fullResponse.substring(0, 100)}...`
      });
      
      return fullResponse;
      
    } catch (error) {
      console.error('❌ AI response generation failed:', error);
      return this.generateFallbackResponse(dataContext);
    }
  }

  /**
   * Create enhanced system prompt based on data context
   */
  private createEnhancedSystemPrompt(dataContext: EnhancedDataContext): string {
    const { intent, metadata } = dataContext;
    
    let prompt = `You are a sophisticated cryptocurrency analyst with access to real-time market data. 

**CRITICAL: You MUST use ONLY the provided real-time data in your response. Do NOT use generic price ranges or outdated information from your training data.**

**FORMATTING REQUIREMENTS:**
- Format your response using **Markdown** for better readability
- Use **## headers** for main sections
- Use **### subheaders** for subsections  
- Use **bold** for important numbers and key insights
- Use *italics* for emphasis and trends
- Use bullet points (-) for lists
- Use \`inline code\` for technical terms and indicators
- Keep responses well-structured and scannable

**REAL-TIME DATA CONTEXT:**
- Query Type: ${intent.type}
- Analysis Depth: ${intent.analysisDepth}
- Data Sources: ${metadata.sources.join(', ')}
- Data Quality: ${metadata.quality}
- Data Coverage: ${Math.round(metadata.coverage * 100)}%
- Data Freshness: LIVE DATA (fetched ${metadata.fetchTime}ms ago)

**MANDATORY INSTRUCTIONS:**
1. **USE ONLY THE PROVIDED PRICE DATA** - Never reference generic price ranges like "$69,000-$70,500"
2. **REFERENCE THE EXACT CURRENT PRICE** provided in the data context
3. **USE THE EXACT 24h CHANGE PERCENTAGE** from the real-time data  
4. **BASE ALL ANALYSIS ON THE PROVIDED MARKET DATA** - not on training data
5. Focus on the specific intent: ${intent.intent}
6. Use the provided real-time data for accuracy
7. Highlight key insights from market structure data when available
8. Adjust detail level based on analysis depth (${intent.analysisDepth})
9. Be concise but comprehensive
10. Note any data limitations or gaps

**DATA VALIDATION REMINDER:**
The data provided is LIVE and CURRENT. If you see a price like $122,612 for Bitcoin, that is the REAL current price - use it, don't replace it with outdated ranges.

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
   * Format data context for AI consumption using comprehensive analysis format
   */
  private formatDataContextForAI(userMessage: string, dataContext: EnhancedDataContext): string {
    console.log('🔄 Formatting data context for AI...');
    
    // Handle multi-coin comparison data
    if (dataContext.multiCoinData && dataContext.intent.type === 'comparison') {
      console.log('✅ Using multi-coin comparison data format');
      return this.formatMultiCoinDataForAI(userMessage, dataContext.multiCoinData);
    }
    
    // Try to get comprehensive analysis data if available (single coin)
    const comprehensiveData = this.prepareComprehensiveAnalysisData(dataContext);
    
    if (comprehensiveData) {
      console.log('✅ Using comprehensive data format with enhanced analysis');
      console.log('📊 Comprehensive data prepared:', {
        name: comprehensiveData.name,
        symbol: comprehensiveData.symbol,
        timeframe: comprehensiveData.timeframe,
        hasPriceContext: !!comprehensiveData.priceContext,
        hasVolumeAnalysis: !!comprehensiveData.volumeAnalysis,
        hasLiquidationData: !!comprehensiveData.liquidationData,
        hasOrderFlow: !!comprehensiveData.orderFlow,
        hasPriceAction: !!comprehensiveData.priceAction
      });
      
      // Use the same formatting logic as the analyze route
      const formattedData = this.formatComprehensiveDataForAI(userMessage, comprehensiveData);
      console.log('📝 Formatted data length for AI:', formattedData.length, 'characters');
      return formattedData;
    }
    
    console.log('⚠️ Falling back to basic data formatting (no comprehensive data available)');
    
    // Fallback to basic formatting
    const { priceData, historicalData, marketStructureData } = dataContext;
    
    let context = `User Query: "${userMessage}"\n\n🔴 LIVE REAL-TIME DATA (USE THIS EXACT DATA - NOT TRAINING DATA):\n`;
    
    // Price data context
    if (priceData) {
      console.log('📊 Adding basic price data to context');
      context += `\n**${priceData.name} (${priceData.symbol}) - CURRENT LIVE DATA:**\n`;
      context += `- 🔥 CURRENT PRICE: $${priceData.currentPrice.toLocaleString()} (THIS IS THE REAL CURRENT PRICE - USE THIS EXACT VALUE)\n`;
      context += `- 📈 24h Change: ${priceData.priceChangePercentage24h >= 0 ? '+' : ''}${priceData.priceChangePercentage24h.toFixed(2)}% (USE THIS EXACT PERCENTAGE)\n`;
      context += `- 💰 Market Cap: $${formatLargeNumber(priceData.marketCap)}\n`;
      context += `- 📊 24h Volume: $${formatLargeNumber(priceData.totalVolume)}\n`;
      context += `- 🏆 Rank: #${priceData.marketCapRank}\n`;
      context += `- ⏰ Data Timestamp: ${new Date().toISOString()} (LIVE DATA - NOT HISTORICAL)\n`;
    }
    
    // Historical context
    if (historicalData && historicalData.prices.length > 0) {
      const prices = historicalData.prices;
      const oldestPrice = prices[0]?.price || 0;
      const newestPrice = prices[prices.length - 1]?.price || 0;
      const change = oldestPrice > 0 ? ((newestPrice - oldestPrice) / oldestPrice) * 100 : 0;
      
      console.log('📈 Adding basic historical data to context:', {
        timeframe: historicalData.timeframe,
        dataPoints: prices.length,
        periodChange: `${change.toFixed(2)}%`
      });
      
      context += `\n**Historical Performance (${historicalData.timeframe})**\n`;
      context += `- Period Change: ${change.toFixed(2)}%\n`;
      context += `- Data Points: ${prices.length} price points\n`;
    }
    
    // Market structure context
    if (marketStructureData) {
      console.log('🏗️ Adding market structure data to context');
      context += "\n**Market Structure Analysis**\n";
      
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
    
    context += '\n🚨 CRITICAL REMINDER: Use ONLY the live data provided above. Do NOT reference outdated price ranges from training data. The prices and changes shown are CURRENT and ACCURATE as of this moment.';
    context += '\nProvide insights and analysis based on this REAL-TIME data only.';
    
    console.log('📝 Basic formatted data length for AI:', context.length, 'characters');
    return context;
  }

  /**
   * Format multi-coin data for AI consumption
   */
  private formatMultiCoinDataForAI(
    userMessage: string,
    multiCoinData: NonNullable<EnhancedDataContext['multiCoinData']>
  ): string {
    const { priceData, historicalData } = multiCoinData;
    
    let context = `User Query: "${userMessage}"\n\n**MULTI-COIN COMPARISON ANALYSIS:**\n`;
    
    // Price comparison
    if (priceData.length > 0) {
      context += "\n**Price Comparison:**\n";
      priceData.forEach((coin, index) => {
        context += `\n**${coin.name} (${coin.symbol})**\n`;
        context += `- Current Price: $${coin.currentPrice.toLocaleString()}\n`;
        context += `- 24h Change: ${coin.priceChangePercentage24h.toFixed(2)}%\n`;
        context += `- Market Cap: $${formatLargeNumber(coin.marketCap)}\n`;
        context += `- 24h Volume: $${formatLargeNumber(coin.totalVolume)}\n`;
        context += `- Rank: #${coin.marketCapRank}\n`;
        
        // Add historical performance if available
        if (historicalData[index] && historicalData[index].prices.length > 0) {
          const prices = historicalData[index].prices;
          const oldestPrice = prices[0]?.price || 0;
          const newestPrice = prices[prices.length - 1]?.price || 0;
          const periodChange = oldestPrice > 0 ? ((newestPrice - oldestPrice) / oldestPrice) * 100 : 0;
          
          context += `- ${historicalData[index].timeframe} Performance: ${periodChange.toFixed(2)}%\n`;
        }
      });
    }
    
    // Performance comparison
    if (historicalData.length > 1) {
      context += `\n**Performance Comparison (${historicalData[0]?.timeframe || '7d'}):**\n`;
      const performances = historicalData.map((data, index) => {
        if (data.prices.length === 0) return null;
        
        const oldestPrice = data.prices[0]?.price || 0;
        const newestPrice = data.prices[data.prices.length - 1]?.price || 0;
        const change = oldestPrice > 0 ? ((newestPrice - oldestPrice) / oldestPrice) * 100 : 0;
        
        return {
          symbol: priceData[index]?.symbol || 'Unknown',
          name: priceData[index]?.name || 'Unknown',
          change: change
        };
      }).filter(p => p !== null);
      
      // Sort by performance
      performances.sort((a, b) => b!.change - a!.change);
      
      performances.forEach((perf, index) => {
        const position = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        context += `${position} ${perf!.symbol}: ${perf!.change > 0 ? '+' : ''}${perf!.change.toFixed(2)}%\n`;
      });
    }
    
    context += '\nProvide comparative analysis highlighting relative performance, strengths, and market dynamics.';
    
    console.log('📝 Multi-coin formatted data length for AI:', context.length, 'characters');
    return context;
  }

  /**
   * Prepare comprehensive analysis data matching the analyze route format
   */
  private prepareComprehensiveAnalysisData(dataContext: EnhancedDataContext): Record<string, unknown> | null {
    const { priceData, historicalData, marketStructureData } = dataContext;
    
    if (!priceData) return null;

    // Basic market data (required)
    const comprehensiveData: Record<string, unknown> = {
      name: priceData.name,
      symbol: priceData.symbol,
      quote: {
        USD: {
          price: priceData.currentPrice,
          percent_change_24h: priceData.priceChangePercentage24h,
          market_cap: priceData.marketCap,
          volume_24h: priceData.totalVolume,
          volume_change_24h: 0, // Would need to calculate
          market_cap_dominance: 0, // Would need to calculate
        }
      },
      timeframe: historicalData?.timeframe || '7d'
    };

    // Add enhanced data if available
    if (historicalData && historicalData.prices.length > 0) {
      const prices = historicalData.prices.map(p => p.price);
      const currentPrice = priceData.currentPrice;
      const recentPrices = prices.slice(-21);
      const recentAvg = prices.slice(-7).reduce((a, b) => a + b, 0) / 7;
      const previousAvg = prices.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
      
      // Price context
      comprehensiveData.priceContext = {
        currentPrice: currentPrice,
        priceHistory: prices,
        momentum: recentAvg > previousAvg ? 'bullish' : 'bearish',
        volatility: Math.abs(priceData.priceChangePercentage24h) > 5 ? 'high' : 
                   Math.abs(priceData.priceChangePercentage24h) > 2 ? 'moderate' : 'low',
        support: Math.min(...recentPrices),
        resistance: Math.max(...recentPrices)
      };

      // Volume analysis (basic)
      if (historicalData.volumes && historicalData.volumes.length > 0) {
        const volumes = historicalData.volumes.map(v => v.volume);
        const recentVolume = volumes.slice(-7).reduce((a, b) => a + b, 0) / 7;
        const previousVolume = volumes.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
        
        comprehensiveData.volumeAnalysis = {
          currentVolume: priceData.totalVolume,
          volumeHistory: volumes,
          volumeTrend: recentVolume > previousVolume * 1.2 ? 'increasing' : 
                      recentVolume < previousVolume * 0.8 ? 'decreasing' : 'stable',
          averageVolume: volumes.reduce((a, b) => a + b, 0) / volumes.length,
          volumeSpike: recentVolume > previousVolume * 1.5
        };
      }
    }

    // Market structure data
    if (marketStructureData) {
      if (marketStructureData.liquidations) {
        comprehensiveData.liquidationData = {
          totalLiquidations24h: marketStructureData.liquidations.total24h,
          longLiquidations: marketStructureData.liquidations.longs24h,
          shortLiquidations: marketStructureData.liquidations.shorts24h,
          liquidationRatio: marketStructureData.liquidations.ratio,
          openInterest: marketStructureData.openInterest?.current,
          openInterestChange: marketStructureData.openInterest?.change24h
        };
      }

      if (marketStructureData.orderFlow) {
        comprehensiveData.orderFlow = {
          takerBuyRatio: marketStructureData.orderFlow.buyPressure / 100,
          buyVolumeUsd: 0, // Would need actual volume data
          sellVolumeUsd: 0, // Would need actual volume data
          buyPressure: marketStructureData.orderFlow.buyPressure > 52 ? 'high' : 
                      marketStructureData.orderFlow.buyPressure > 48 ? 'moderate' : 'low',
          sellPressure: marketStructureData.orderFlow.sellPressure > 52 ? 'high' : 
                       marketStructureData.orderFlow.sellPressure > 48 ? 'moderate' : 'low',
          netFlow: marketStructureData.orderFlow.netFlow
        };
      }
    }

    // Basic technical indicators (placeholder - would need actual calculation)
    comprehensiveData.hullSuite = {
      trendDirection: priceData.priceChangePercentage24h > 0 ? 'bullish' : 'bearish',
      crossoverSignal: 'none',
      strength: Math.abs(priceData.priceChangePercentage24h) > 3 ? 'strong' : 'moderate'
    };

    // Price action
    comprehensiveData.priceAction = {
      trend: priceData.priceChangePercentage24h > 2 ? 'uptrend' : 
             priceData.priceChangePercentage24h < -2 ? 'downtrend' : 'sideways',
      volatility: Math.abs(priceData.priceChangePercentage24h) > 5 ? 'high' : 
                 Math.abs(priceData.priceChangePercentage24h) > 2 ? 'moderate' : 'low',
      volume_profile: 'stable', // Would need calculation
      priceLevel: 'neutral',
      momentum: priceData.priceChangePercentage24h > 0 ? 'bullish' : 'bearish'
    };

    return comprehensiveData;
  }

  /**
   * Format comprehensive data for AI using the same logic as analyze route
   */
  private formatComprehensiveDataForAI(userMessage: string, data: Record<string, unknown>): string {
    const sections: string[] = [];

    // Add header emphasizing real-time data
    sections.push(`User Query: "${userMessage}"\n\n🔴 COMPREHENSIVE LIVE MARKET ANALYSIS - USE THIS EXACT DATA:\n`);

    // Enhanced market data with historical context
    const quote = data.quote as Record<string, Record<string, number>> | undefined;
    sections.push(`
**🔥 CURRENT MARKET OVERVIEW (LIVE DATA - USE THESE EXACT VALUES):**
${data.name} (${data.symbol})
💰 CURRENT PRICE: $${quote?.USD?.price?.toLocaleString() || 'N/A'} (THIS IS THE REAL CURRENT PRICE)
📈 24h Change: ${quote?.USD?.percent_change_24h ? (quote.USD.percent_change_24h >= 0 ? '+' : '') + quote.USD.percent_change_24h.toFixed(2) : 'N/A'}% (USE THIS EXACT PERCENTAGE)
🏦 Market Cap: $${formatLargeNumber(quote?.USD?.market_cap || 0)}
📊 24h Volume: $${formatLargeNumber(quote?.USD?.volume_24h || 0)}
⏰ Data Timestamp: ${new Date().toISOString()} (LIVE - NOT HISTORICAL DATA)`);

    // Enhanced price context
    if (data.priceContext) {
      const priceContext = data.priceContext as Record<string, unknown>;
      const priceRange = `$${Number(priceContext.support)?.toLocaleString() || 'N/A'} - $${Number(priceContext.resistance)?.toLocaleString() || 'N/A'}`;
      const historicalCount = (priceContext.priceHistory as number[])?.length || 0;
      sections.push(`
**Price Context (${historicalCount} periods):**
Momentum: ${priceContext.momentum || 'N/A'}, Volatility: ${priceContext.volatility || 'N/A'}
Support/Resistance Range: ${priceRange}`);
    }

    // Enhanced volume analysis
    if (data.volumeAnalysis) {
      const volumeAnalysis = data.volumeAnalysis as Record<string, unknown>;
      const currentVolume = Number(volumeAnalysis.currentVolume) || 0;
      const averageVolume = Number(volumeAnalysis.averageVolume) || 0;
      const volumeChange = averageVolume > 0 ? ((currentVolume - averageVolume) / averageVolume * 100).toFixed(1) : '0';
      sections.push(`
**Volume Analysis:**
Trend: ${volumeAnalysis.volumeTrend || 'N/A'}, Volume vs Average: ${volumeChange > '0' ? '+' : ''}${volumeChange}%
${volumeAnalysis.volumeSpike ? 'VOLUME SPIKE DETECTED' : 'Normal volume activity'}`);
    }

    // Market Structure Section
    if (data.liquidationData || data.orderFlow) {
      const marketStructure: string[] = [];
      
      if (data.liquidationData) {
        const liquidationData = data.liquidationData as Record<string, unknown>;
        const longLiquidations = Number(liquidationData.longLiquidations);
        const shortLiquidations = Number(liquidationData.shortLiquidations);
        if (!Number.isNaN(longLiquidations) && !Number.isNaN(shortLiquidations)) {
          const total = longLiquidations + shortLiquidations;
          const longRatio = total > 0 ? (longLiquidations / total * 100).toFixed(1) : '0';
          marketStructure.push(`Liquidations: ${longRatio}% long, ${(100 - Number.parseFloat(longRatio)).toFixed(1)}% short`);
        }
        const openInterest = Number(liquidationData.openInterest);
        if (!Number.isNaN(openInterest)) {
          const openInterestChange = Number(liquidationData.openInterestChange);
          const changeText = !Number.isNaN(openInterestChange) ? ` (${openInterestChange > 0 ? '+' : ''}${openInterestChange.toFixed(1)}%)` : '';
          marketStructure.push(`Open Interest: $${formatLargeNumber(openInterest)}${changeText}`);
        }
      }
      
      if (data.orderFlow) {
        const orderFlow = data.orderFlow as Record<string, unknown>;
        const takerBuyRatio = Number(orderFlow.takerBuyRatio);
        if (!Number.isNaN(takerBuyRatio)) {
          marketStructure.push(`Taker Buy Ratio: ${(takerBuyRatio * 100).toFixed(1)}% (${orderFlow.netFlow || 'neutral'})`);
        }
      }
      
      if (marketStructure.length > 0) {
        sections.push(`\n**Market Structure:**\n${marketStructure.map(s => `• ${s}`).join('\n')}`);
      }
    }

    // Price Action Context
    if (data.priceAction) {
      const priceAction = data.priceAction as Record<string, unknown>;
      const priceLevel = priceAction.priceLevel;
      const priceLevelText = priceLevel && priceLevel !== 'neutral' ? `, Price Level: ${priceLevel}` : '';
      sections.push(`\n**Price Action:**\nTrend: ${priceAction.trend || 'N/A'}, Volatility: ${priceAction.volatility || 'N/A'}, Volume: ${priceAction.volume_profile || 'N/A'}${priceLevelText}`);
    }

    // Add strong footer emphasizing real-time data usage
    sections.push("\n\n🚨 CRITICAL REMINDER: All data above is LIVE and CURRENT. Use ONLY these specific values in your analysis. Do NOT reference outdated price ranges or training data. The prices shown are the REAL current market prices.");
    
    return sections.join('\n');
  }

  /**
   * Generate fallback response when AI is not available
   */
  private generateFallbackResponse(dataContext: EnhancedDataContext): string {
    console.log('🔄 Generating fallback response (AI unavailable)');
    
    const { intent, priceData } = dataContext;
    
    if (priceData) {
      const changeEmoji = priceData.priceChangePercentage24h >= 0 ? '📈' : '📉';
      const fallbackResponse = `${changeEmoji} ${priceData.name} is currently trading at $${priceData.currentPrice.toLocaleString()} with a 24h change of ${priceData.priceChangePercentage24h.toFixed(2)}%. Market cap: $${formatLargeNumber(priceData.marketCap)}.`;
      
      console.log('📊 Fallback response with price data:', {
        coin: priceData.name,
        price: priceData.currentPrice,
        change: priceData.priceChangePercentage24h,
        responseLength: fallbackResponse.length
      });
      
      return fallbackResponse;
    }
    
    const fallbackResponse = `I've gathered the requested data for your ${intent.type} query. Please check the visual components for detailed information.`;
    
    console.log('📋 Basic fallback response:', {
      intentType: intent.type,
      responseLength: fallbackResponse.length
    });
    
    return fallbackResponse;
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
          "Compare this with Bitcoin"
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
   * Generate trading response
   */
  private generateTradeResponse(
    tradeAction: import('@/types/enhanced-chat').TradeAction,
    userMessage: string,
    startTime: number
  ): import('@/types/enhanced-chat').EnhancedChatResponse {
    
    const inputTokenDisplay = tradeAction.inputToken ? getTokenDisplayName(tradeAction.inputToken) : 'Unknown';
    const outputTokenDisplay = tradeAction.outputToken ? getTokenDisplayName(tradeAction.outputToken) : 'Unknown';
    
    // Create trade preview component
    const components: import('@/types/enhanced-chat').ChatComponent[] = [{
      id: `trade_${Date.now()}`,
      type: 'trade_preview',
      priority: 1,
      size: 'large',
      title: 'Trade Preview',
      subtitle: `${tradeAction.type.toUpperCase()}: ${inputTokenDisplay} → ${outputTokenDisplay}`,
      data: {
        tradeAction,
        timestamp: Date.now()
      },
      metadata: {
        dataSource: 'jupiter_aggregator',
        lastUpdated: Date.now(),
        reliability: 'high'
      }
    }];

    // Generate response text
    const textResponse = this.generateTradeResponseText(tradeAction, inputTokenDisplay, outputTokenDisplay);
    
    // Generate follow-up suggestions for trading
    const followUpSuggestions = this.generateTradeFollowUpSuggestions(tradeAction, inputTokenDisplay, outputTokenDisplay);

    return {
      textResponse,
      components,
      followUpSuggestions,
      dataContext: {
        intent: {
          type: 'trade',
          coins: [inputTokenDisplay.toLowerCase(), outputTokenDisplay.toLowerCase()],
          timeframe: null,
          dataTypes: ['price'],
          analysisDepth: 'quick',
          intent: `Trade ${tradeAction.amount || '?'} ${inputTokenDisplay} for ${outputTokenDisplay}`,
          keywords: ['swap', 'trade', inputTokenDisplay.toLowerCase(), outputTokenDisplay.toLowerCase()],
          confidence: tradeAction.confidence,
          tradeAction
        },
        metadata: {
          sources: ['jupiter_aggregator'],
          fetchTime: Date.now() - startTime,
          quality: 'high',
          coverage: 1.0
        }
      },
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Generate trade response text
   */
  private generateTradeResponseText(
    tradeAction: import('@/types/enhanced-chat').TradeAction,
    inputTokenDisplay: string,
    outputTokenDisplay: string
  ): string {
    const { type, amount, confidence, slippage } = tradeAction;
    const confidencePercent = Math.round(confidence * 100);
    
    let responseText = `I understand you want to ${type} `;
    
    if (amount) {
      responseText += `${amount} ${inputTokenDisplay} for ${outputTokenDisplay}. `;
    } else {
      responseText += `${inputTokenDisplay} for ${outputTokenDisplay}. `;
    }
    
    responseText += `\n\nI'm ${confidencePercent}% confident about this trade. `;
    
    if (confidencePercent >= 90) {
      responseText += "This looks like a clear trading instruction! ";
    } else if (confidencePercent >= 70) {
      responseText += "This seems like a trading request, though some details might need clarification. ";
    } else {
      responseText += "This might be a trading request, but I'd like to confirm the details. ";
    }
    
    responseText += "Let me get you the best quote from Jupiter and other DEXs.\n\n⚡ **Trade Details:**\n";
    responseText += `- Action: ${type.toUpperCase()}\n`;
    responseText += `- Amount: ${amount || 'To be specified'} ${inputTokenDisplay}\n`;
    responseText += `- Target: ${outputTokenDisplay}\n`;
    responseText += `- Slippage: ${slippage || 0.5}%\n\n`;
    
    if (!amount) {
      responseText += "💡 **Note:** You didn't specify an amount. The trade preview will help you enter the exact amount you want to swap.\n\n";
    }
    
    responseText += "Review the details above and click **\"Execute Trade\"** when ready! The transaction will be signed with your connected wallet.";
    
    return responseText;
  }

  /**
   * Generate follow-up suggestions for trading
   */
  private generateTradeFollowUpSuggestions(
    tradeAction: import('@/types/enhanced-chat').TradeAction,
    inputTokenDisplay: string,
    outputTokenDisplay: string
  ): string[] {
    const suggestions: string[] = [];
    
    // Suggest price check
    suggestions.push(`What's the current price of ${outputTokenDisplay}?`);
    
    // Suggest different amounts
    if (tradeAction.amount) {
      const amount = tradeAction.amount;
      if (amount >= 10) {
        suggestions.push(`Swap ${amount / 2} ${inputTokenDisplay} for ${outputTokenDisplay}`);
      } else {
        suggestions.push(`Swap ${amount * 2} ${inputTokenDisplay} for ${outputTokenDisplay}`);
      }
    } else {
      suggestions.push(`Swap 10 ${inputTokenDisplay} for ${outputTokenDisplay}`);
    }
    
    // Suggest reverse trade
    suggestions.push(`Swap ${outputTokenDisplay} for ${inputTokenDisplay}`);
    
    return suggestions.slice(0, 3);
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
      textResponse: "I encountered an issue processing your request. Please try rephrasing your question or try again in a moment.",
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