import { openai, isOpenAIAvailable } from '@/lib/openai';
import type { 
  EnhancedChatIntent, 
  DataType, 
  VisualizationType
} from '@/types/enhanced-chat';
import { INTENT_PATTERNS, TIMEFRAME_PATTERNS } from '@/types/enhanced-chat';

export class EnhancedIntentDetector {
  
  /**
   * Main entry point for enhanced intent detection
   */
  async detectIntent(userMessage: string): Promise<EnhancedChatIntent> {
    const startTime = Date.now();
    
    // Stage 1: Pattern-based detection (fast, local)
    const patternBasedIntent = this.detectPatternBasedIntent(userMessage);
    
    // Stage 2: AI-enhanced detection (slower, more accurate)
    const aiEnhancedIntent = await this.enhanceWithAI(userMessage, patternBasedIntent);
    
    // Stage 3: Validate and finalize
    const finalIntent = this.validateAndFinalizeIntent(aiEnhancedIntent);
    
    console.log(`Intent detection completed in ${Date.now() - startTime}ms:`, finalIntent);
    
    return finalIntent;
  }

  /**
   * Stage 1: Fast pattern-based intent detection
   */
  private detectPatternBasedIntent(userMessage: string): Partial<EnhancedChatIntent> {
    const message = userMessage.toLowerCase().trim();
    
    // Extract coins mentioned
    const coins = this.extractCoins(message);
    
    // Extract timeframe
    const timeframe = this.extractTimeframe(message);
    
    // Detect intent patterns
    const patternMatches = this.matchIntentPatterns(message);
    
    // Extract keywords
    const keywords = this.extractKeywords(message);
    
    // Determine analysis depth from keywords
    const analysisDepth = this.determineAnalysisDepth(message);
    
    // Determine query type
    const type = this.determineQueryType(message, coins, patternMatches);
    
    return {
      type,
      coins,
      timeframe,
      dataTypes: patternMatches.dataTypes,
      analysisDepth,
      keywords,
      visualizationType: patternMatches.visualizations,
      confidence: patternMatches.confidence,
      intent: `Pattern-based detection: ${type} query for ${coins.length} coins`
    };
  }

  /**
   * Extract cryptocurrency mentions from message
   */
  private extractCoins(message: string): string[] {
    const coinPatterns = [
      // Symbols (BTC, ETH, etc.)
      /\b(BTC|BITCOIN|ETH|ETHEREUM|SOL|SOLANA|ADA|CARDANO|DOT|POLKADOT|LINK|CHAINLINK|MATIC|POLYGON|LTC|LITECOIN|XRP|RIPPLE|DOGE|DOGECOIN|AVAX|AVALANCHE|UNI|UNISWAP|ATOM|COSMOS|ALGO|ALGORAND|XLM|STELLAR|FTM|FANTOM|SAND|SANDBOX|MANA|DECENTRALAND|AXS|AXIE|COMP|COMPOUND|YFI|YEARN|MKR|MAKER|AAVE|CRV|CURVE|SUSHI|SUSHISWAP)\b/gi,
      // Full names
      /\b(bitcoin|ethereum|solana|cardano|polkadot|chainlink|polygon|litecoin|ripple|dogecoin|avalanche|uniswap|cosmos|algorand|stellar|fantom|sandbox|decentraland|compound|yearn|maker|curve|sushiswap)\b/gi
    ];
    
    const coins = new Set<string>();
    
    coinPatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) {
        matches.forEach(match => coins.add(match.toLowerCase()));
      }
    });
    
    return Array.from(coins);
  }

  /**
   * Extract timeframe from message using patterns
   */
  private extractTimeframe(message: string): EnhancedChatIntent['timeframe'] {
    for (const { pattern, value, multiplier, unit } of TIMEFRAME_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        if (value) {
          return value as EnhancedChatIntent['timeframe'];
        }
        
        if (multiplier && unit && match[1]) {
          const number = parseInt(match[1]);
          const totalDays = unit === 'hours' ? number / 24 : number * multiplier;
          
          // Map to supported timeframes
          if (totalDays <= 1) return '1d';
          if (totalDays <= 7) return '7d';
          if (totalDays <= 30) return '30d';
          if (totalDays <= 90) return '90d';
          return '1y';
        }
      }
    }
    
    // Default timeframe based on context
    if (message.includes('today') || message.includes('now')) return '1d';
    if (message.includes('week')) return '7d';
    if (message.includes('month')) return '30d';
    
    return null;
  }

  /**
   * Match against predefined intent patterns
   */
  private matchIntentPatterns(message: string): {
    dataTypes: DataType[];
    visualizations: VisualizationType[];
    confidence: number;
  } {
    const dataTypes = new Set<DataType>();
    const visualizations = new Set<VisualizationType>();
    let maxConfidence = 0;
    
    Object.values(INTENT_PATTERNS).flat().forEach(pattern => {
      const keywordMatches = pattern.keywords.filter(keyword => 
        message.includes(keyword.toLowerCase())
      ).length;
      
      if (keywordMatches > 0) {
        const confidence = (keywordMatches / pattern.keywords.length) * pattern.confidence;
        
        if (confidence > 0.3) { // Threshold for inclusion
          pattern.dataTypes.forEach(dt => dataTypes.add(dt));
          pattern.visualizationHints.forEach(vh => visualizations.add(vh as VisualizationType));
          maxConfidence = Math.max(maxConfidence, confidence);
        }
      }
    });
    
    // Default data types if none detected
    if (dataTypes.size === 0) {
      dataTypes.add('price');
      dataTypes.add('volume');
      visualizations.add('price_card');
    }
    
    return {
      dataTypes: Array.from(dataTypes),
      visualizations: Array.from(visualizations),
      confidence: maxConfidence
    };
  }

  /**
   * Extract relevant keywords for context
   */
  private extractKeywords(message: string): string[] {
    const importantWords = [
      'price', 'analysis', 'technical', 'chart', 'performance', 'compare', 
      'trend', 'bullish', 'bearish', 'support', 'resistance', 'volume',
      'liquidation', 'funding', 'rsi', 'macd', 'bollinger', 'moving average',
      'overbought', 'oversold', 'breakout', 'breakdown'
    ];
    
    return importantWords.filter(word => 
      message.toLowerCase().includes(word.toLowerCase())
    );
  }

  /**
   * Determine analysis depth from message content
   */
  private determineAnalysisDepth(message: string): EnhancedChatIntent['analysisDepth'] {
    const deepKeywords = ['detailed', 'comprehensive', 'deep', 'thorough', 'complete', 'full'];
    const quickKeywords = ['quick', 'brief', 'summary', 'overview', 'simple'];
    
    if (deepKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
      return 'comprehensive';
    }
    
    if (quickKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
      return 'quick';
    }
    
    // Default based on complexity indicators
    const complexityIndicators = ['analysis', 'technical', 'compare', 'vs', 'indicators'];
    if (complexityIndicators.some(indicator => message.toLowerCase().includes(indicator))) {
      return 'detailed';
    }
    
    return 'quick';
  }

  /**
   * Determine the main query type
   */
  private determineQueryType(
    message: string, 
    coins: string[], 
    patterns: { dataTypes: DataType[] }
  ): EnhancedChatIntent['type'] {
    // Analysis if technical indicators mentioned
    if (patterns.dataTypes.some(dt => ['technical', 'market_structure'].includes(dt))) {
      return 'analysis';
    }
    
    // Comparison if multiple coins or comparison keywords
    if (coins.length > 1 || /\b(compare|vs|versus|against)\b/i.test(message)) {
      return 'comparison';
    }
    
    // Market if asking about general market
    if (/\b(market|crypto|top|leaders|gainers|losers)\b/i.test(message) && coins.length === 0) {
      return 'market';
    }
    
    // Coin-specific query
    if (coins.length > 0) {
      return 'coin';
    }
    
    return 'none';
  }

  /**
   * Stage 2: Enhance with AI for better accuracy
   */
  private async enhanceWithAI(
    userMessage: string, 
    patternIntent: Partial<EnhancedChatIntent>
  ): Promise<EnhancedChatIntent> {
    
    if (!isOpenAIAvailable || !openai) {
      console.log('OpenAI not available, using pattern-based detection only');
      return this.fallbackToPatternIntent(userMessage, patternIntent);
    }

    const systemPrompt = `You are an expert cryptocurrency query analyzer. Analyze user queries and extract structured intent information.

CONTEXT: The user is asking about cryptocurrency data and analysis.

Your task: Parse the query and return ONLY valid JSON with this exact structure:
{
  "type": "coin" | "market" | "comparison" | "analysis" | "portfolio" | "news" | "none",
  "coins": ["array of coin names/symbols"],
  "timeframe": "1h" | "4h" | "1d" | "7d" | "30d" | "90d" | "1y" | "max" | null,
  "dataTypes": ["array from: price, volume, technical, market_structure, liquidations, funding, open_interest, historical, news, social"],
  "analysisDepth": "quick" | "detailed" | "comprehensive",
  "intent": "brief description of what user wants",
  "visualizationType": ["array from: price_card, line_chart, candlestick_chart, volume_chart, technical_analysis, market_structure, comparison_table, heatmap, comprehensive_analysis"],
  "keywords": ["relevant keywords from the query"],
  "confidence": 0.0-1.0
}

EXAMPLES:
"How is Bitcoin doing the last 7 days?" → {"type": "coin", "coins": ["bitcoin"], "timeframe": "7d", "dataTypes": ["price", "volume", "historical"], "analysisDepth": "detailed", "intent": "Bitcoin performance over 7 days", "visualizationType": ["price_card", "line_chart"], "keywords": ["bitcoin", "performance", "7 days"], "confidence": 0.9}

"Give me a detailed technical analysis of ETH" → {"type": "analysis", "coins": ["ethereum"], "timeframe": "30d", "dataTypes": ["technical", "price", "historical"], "analysisDepth": "comprehensive", "intent": "Technical analysis of Ethereum", "visualizationType": ["technical_analysis", "candlestick_chart"], "keywords": ["technical", "analysis", "ethereum"], "confidence": 0.95}

Pattern-based detection found: ${JSON.stringify(patternIntent, null, 2)}

Now analyze this query: "${userMessage}"`;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/parse-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage,
          systemPrompt 
        })
      });
      
      if (!response.ok) {
        throw new Error('AI parsing failed');
      }
      
      const aiResult = await response.json();
      
      // Merge AI results with pattern-based results
      return {
        type: aiResult.type || patternIntent.type || 'none',
        coins: aiResult.coins || patternIntent.coins || [],
        timeframe: aiResult.timeframe || patternIntent.timeframe || null,
        dataTypes: this.mergeArrays(aiResult.dataTypes, patternIntent.dataTypes),
        analysisDepth: aiResult.analysisDepth || patternIntent.analysisDepth || 'quick',
        intent: aiResult.intent || patternIntent.intent || 'User query analysis',
        visualizationType: this.mergeArrays(aiResult.visualizationType, patternIntent.visualizationType),
        keywords: this.mergeArrays(aiResult.keywords, patternIntent.keywords),
        confidence: Math.max(aiResult.confidence || 0, patternIntent.confidence || 0)
      };
      
    } catch (error) {
      console.error('AI enhancement failed:', error);
      return this.fallbackToPatternIntent(userMessage, patternIntent);
    }
  }

  /**
   * Fallback when AI is not available
   */
  private fallbackToPatternIntent(
    userMessage: string, 
    patternIntent: Partial<EnhancedChatIntent>
  ): EnhancedChatIntent {
    return {
      type: patternIntent.type || 'none',
      coins: patternIntent.coins || [],
      timeframe: patternIntent.timeframe || null,
      dataTypes: patternIntent.dataTypes || ['price'],
      analysisDepth: patternIntent.analysisDepth || 'quick',
      intent: patternIntent.intent || `Analysis of: ${userMessage.slice(0, 50)}...`,
      visualizationType: patternIntent.visualizationType || ['price_card'],
      keywords: patternIntent.keywords || [],
      confidence: patternIntent.confidence || 0.5
    };
  }

  /**
   * Stage 3: Validate and finalize intent
   */
  private validateAndFinalizeIntent(intent: EnhancedChatIntent): EnhancedChatIntent {
    // Ensure at least one data type
    if (intent.dataTypes.length === 0) {
      intent.dataTypes = ['price'];
    }
    
    // Ensure at least one visualization
    if (!intent.visualizationType || intent.visualizationType.length === 0) {
      intent.visualizationType = ['price_card'];
    }
    
    // Adjust analysis depth based on data types
    if (intent.dataTypes.includes('technical') && intent.analysisDepth === 'quick') {
      intent.analysisDepth = 'detailed';
    }
    
    // Set default timeframe for historical queries
    if (intent.dataTypes.includes('historical') && !intent.timeframe) {
      intent.timeframe = '30d';
    }
    
    // Ensure confidence is within bounds
    intent.confidence = Math.max(0, Math.min(1, intent.confidence));
    
    return intent;
  }

  /**
   * Utility: Merge arrays avoiding duplicates
   */
  private mergeArrays<T>(arr1?: T[], arr2?: T[]): T[] {
    const merged = new Set<T>();
    if (arr1) arr1.forEach(item => merged.add(item));
    if (arr2) arr2.forEach(item => merged.add(item));
    return Array.from(merged);
  }
}

// Export singleton instance
export const enhancedIntentDetector = new EnhancedIntentDetector(); 