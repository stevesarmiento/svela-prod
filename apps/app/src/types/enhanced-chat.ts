// Enhanced Chat Intent Detection Types
export interface EnhancedChatIntent {
  type: 'coin' | 'market' | 'comparison' | 'analysis' | 'portfolio' | 'news' | 'none'
  coins: string[]
  timeframe: '1h' | '4h' | '1d' | '7d' | '30d' | '90d' | '1y' | 'max' | null
  dataTypes: DataType[]
  analysisDepth: 'quick' | 'detailed' | 'comprehensive'
  intent: string
  visualizationType?: VisualizationType[]
  keywords: string[]
  confidence: number
}

export type DataType = 
  | 'price' 
  | 'volume' 
  | 'technical' 
  | 'market_structure' 
  | 'liquidations' 
  | 'funding' 
  | 'open_interest'
  | 'historical'
  | 'news'
  | 'social'

export type VisualizationType = 
  | 'price_card' 
  | 'line_chart' 
  | 'candlestick_chart' 
  | 'volume_chart'
  | 'technical_analysis' 
  | 'market_structure' 
  | 'comparison_table'
  | 'comparison_chart'  // Add this new type
  | 'heatmap'
  | 'comprehensive_analysis'

// Enhanced Data Context
export interface EnhancedDataContext {
  intent: EnhancedChatIntent;
  priceData?: CoinPriceData;
  historicalData?: CoinHistoricalData;
  technicalData?: TechnicalAnalysisData;
  marketStructureData?: MarketStructureData;
  comparisonData?: ComparisonData;
  // Add multi-coin data for comparison queries
  multiCoinData?: {
    priceData: CoinPriceData[];
    historicalData: CoinHistoricalData[];
    marketStructureData: MarketStructureData[];
  };
  metadata: {
    sources: string[];
    fetchTime: number;
    quality: 'high' | 'medium' | 'low';
    coverage: number;
  };
}

// Enhanced Component System
export interface ChatComponent {
  id: string;
  type: VisualizationType;
  priority: number;
  size: 'small' | 'medium' | 'large';
  title: string;
  subtitle?: string;
  data: Record<string, unknown>;
  metadata: {
    dataSource: string;
    lastUpdated: number;
    reliability: 'high' | 'medium' | 'low';
  };
}

export interface EnhancedChatResponse {
  textResponse: string
  components: ChatComponent[]
  followUpSuggestions?: string[]
  dataContext: EnhancedDataContext
  processingTime: number
}

// Data Interfaces
export interface CoinPriceData {
  id: number
  name: string
  symbol: string
  price: number
  priceChange24h: number
  priceChange7d?: number
  priceChange30d?: number
  volume24h: number
  marketCap: number
  rank: number
  lastUpdated: string
  image?: string // Add image field for CoinGecko image URLs
}

export interface CoinHistoricalData {
  coinId: number
  timeframe: string
  prices: Array<{ timestamp: number; price: number }>
  volumes?: Array<{ timestamp: number; volume: number }>
  marketCaps?: Array<{ timestamp: number; marketCap: number }>
}

export interface TechnicalAnalysisData {
  coinId: number
  indicators: {
    rsi?: { value: number; signal: 'overbought' | 'oversold' | 'neutral' }
    macd?: { value: number; signal: number; histogram: number }
    bollinger?: { upper: number; middle: number; lower: number; position: string }
    movingAverages?: { ma20: number; ma50: number; ma200: number }
  }
  signals: {
    overall: 'bullish' | 'bearish' | 'neutral'
    strength: 'strong' | 'moderate' | 'weak'
    confidence: number
  }
  trends: {
    short: 'up' | 'down' | 'sideways'
    medium: 'up' | 'down' | 'sideways'
    long: 'up' | 'down' | 'sideways'
  }
}

export interface MarketStructureData {
  coinId: number
  fundingRate?: {
    current: number
    average24h: number
    trend: 'increasing' | 'decreasing' | 'stable'
  }
  openInterest?: {
    current: number
    change24h: number
    trend: 'increasing' | 'decreasing' | 'stable'
  }
  liquidations?: {
    longs24h: number
    shorts24h: number
    total24h: number
    ratio: number
  }
  orderFlow?: {
    buyPressure: number
    sellPressure: number
    netFlow: 'bullish' | 'bearish' | 'neutral'
  }
}

export interface ComparisonData {
  coins: CoinPriceData[]
  metrics: {
    performance: Array<{ coinId: number; change24h: number; change7d: number }>
    correlation?: Array<{ coin1: number; coin2: number; correlation: number }>
    relative_strength?: Array<{ coinId: number; strength: number }>
  }
}

// Intent Detection Patterns
export interface IntentPattern {
  keywords: string[]
  dataTypes: DataType[]
  timeframeHints: string[]
  analysisDepthHints: string[]
  visualizationHints: string[]
  confidence: number
}

export const INTENT_PATTERNS: Record<string, IntentPattern[]> = {
  technical_analysis: [
    {
      keywords: ['rsi', 'macd', 'bollinger', 'technical', 'analysis', 'indicators', 'signals', 'overbought', 'oversold'],
      dataTypes: ['technical', 'historical', 'price'],
      timeframeHints: ['technical analysis typically uses', '30d', '7d'],
      analysisDepthHints: ['detailed', 'comprehensive'],
      visualizationHints: ['technical_analysis', 'line_chart'],
      confidence: 0.9
    }
  ],
  market_structure: [
    {
      keywords: ['funding', 'liquidation', 'open interest', 'leverage', 'futures', 'derivatives', 'longs', 'shorts'],
      dataTypes: ['market_structure', 'funding', 'liquidations', 'open_interest'],
      timeframeHints: ['1d', '7d'],
      analysisDepthHints: ['detailed'],
      visualizationHints: ['market_structure', 'line_chart'],
      confidence: 0.85
    }
  ],
  price_performance: [
    {
      keywords: ['price', 'performance', 'doing', 'how is', 'trading', 'up', 'down', 'change'],
      dataTypes: ['price', 'historical', 'volume'],
      timeframeHints: ['24h', '7d', '30d'],
      analysisDepthHints: ['quick', 'detailed'],
      visualizationHints: ['price_card', 'line_chart'],
      confidence: 0.8
    }
  ],
  temporal_analysis: [
    {
      keywords: ['last', 'past', 'over', 'during', 'since', 'days', 'weeks', 'months', 'year'],
      dataTypes: ['historical', 'price', 'volume'],
      timeframeHints: ['extract from context'],
      analysisDepthHints: ['detailed'],
      visualizationHints: ['line_chart', 'candlestick_chart'],
      confidence: 0.75
    }
  ],
  comparison: [
    {
      keywords: ['compare', 'vs', 'versus', 'against', 'better', 'worse', 'outperform'],
      dataTypes: ['price', 'historical', 'technical'],
      timeframeHints: ['7d', '30d'],
      analysisDepthHints: ['detailed'],
      visualizationHints: ['comparison_table', 'line_chart'],
      confidence: 0.9
    }
  ]
}

// Timeframe extraction patterns
export const TIMEFRAME_PATTERNS = [
  { pattern: /(\d+)\s*h(our)?s?/i, multiplier: 1, unit: 'hours' },
  { pattern: /(\d+)\s*d(ay)?s?/i, multiplier: 1, unit: 'days' },
  { pattern: /(\d+)\s*w(eek)?s?/i, multiplier: 7, unit: 'days' },
  { pattern: /(\d+)\s*m(onth)?s?/i, multiplier: 30, unit: 'days' },
  { pattern: /(\d+)\s*y(ear)?s?/i, multiplier: 365, unit: 'days' },
  { pattern: /last\s+(\d+)\s*d(ay)?s?/i, multiplier: 1, unit: 'days' },
  { pattern: /past\s+(\d+)\s*d(ay)?s?/i, multiplier: 1, unit: 'days' },
  { pattern: /last\s+week/i, value: '7d' },
  { pattern: /past\s+week/i, value: '7d' },
  { pattern: /last\s+month/i, value: '30d' },
  { pattern: /past\s+month/i, value: '30d' },
  { pattern: /last\s+year/i, value: '1y' },
  { pattern: /ytd|year\s+to\s+date/i, value: '1y' },
] 