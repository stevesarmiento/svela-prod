import type { CoinMarketData } from './coins'

// v0 Platform API Types
export interface V0GenerationRequest {
  query: string
  chartType: ChartType
  data: CoinMarketData[]
  preferences?: ChartPreferences
  timeframe?: string
  indicators?: TechnicalIndicator[]
}

export interface V0GenerationResponse {
  success: boolean
  component?: GeneratedComponent
  previewUrl?: string
  error?: string
  usage?: {
    tokensUsed: number
    responseTime: number
  }
}

export interface GeneratedComponent {
  code: string
  files: ComponentFile[]
  dependencies: string[]
  metadata: ComponentMetadata
}

export interface ComponentFile {
  path: string
  content: string
  type: 'component' | 'style' | 'config'
}

export interface ComponentMetadata {
  name: string
  description: string
  chartType: ChartType
  dataSource: string
  generatedAt: number
  version: string
}

// Chart Configuration Types
export type ChartType = 
  | 'price_line'
  | 'price_candlestick' 
  | 'comparison_multi'
  | 'volume_analysis'
  | 'technical_indicators'
  | 'market_overview'
  | 'correlation_matrix'
  | 'performance_heatmap'
  | 'custom'

export interface ChartPreferences {
  theme: 'light' | 'dark' | 'auto'
  colorScheme: 'default' | 'pastel' | 'vibrant' | 'monochrome'
  animations: boolean
  responsive: boolean
  showLegend: boolean
  showGrid: boolean
  showTooltips: boolean
  height?: number
  width?: number
}

export type TechnicalIndicator = 
  | 'RSI'
  | 'MACD'
  | 'Bollinger_Bands'
  | 'Moving_Average'
  | 'Volume'
  | 'Support_Resistance'
  | 'Hull_Suite'
  | 'Wave_Trend'

// Chart Generation Context
export interface ChartGenerationContext {
  userQuery: string
  intent: GenerationIntent
  dataContext: ChartDataContext
  designSystem: DesignSystemConfig
  constraints: GenerationConstraints
}

export interface GenerationIntent {
  primary: 'comparison' | 'analysis' | 'overview' | 'deep_dive'
  focus: 'price' | 'volume' | 'technical' | 'fundamental'
  timeframe: 'realtime' | 'short' | 'medium' | 'long'
  complexity: 'simple' | 'moderate' | 'advanced'
}

export interface ChartDataContext {
  coinCount: number
  dataQuality: 'high' | 'medium' | 'low'
  timeRange: string
  availableMetrics: string[]
  missingData?: string[]
}

export interface DesignSystemConfig {
  baseColors: {
    background: string
    foreground: string
    border: string
    accent: string
  }
  chartColors: string[]
  typography: {
    fontFamily: string
    sizes: Record<string, string>
  }
  spacing: Record<string, string>
  borderRadius: string
}

export interface GenerationConstraints {
  maxComplexity: number
  allowedLibraries: string[]
  performanceTargets: {
    maxRenderTime: number
    maxMemoryUsage: number
  }
  accessibility: boolean
}

// Prompt Engineering Types
export interface ChartPromptTemplate {
  id: string
  name: string
  chartType: ChartType
  template: string
  variables: string[]
  examples: PromptExample[]
}

export interface PromptExample {
  query: string
  expectedOutput: string
  dataStructure: Record<string, unknown>
}

// Component Registry Types
export interface GeneratedChartComponent {
  id: string
  name: string
  code: string
  props: ComponentProps
  usage: ComponentUsage
  performance: PerformanceMetrics
  createdAt: number
  lastUsed: number
}

export interface ComponentProps {
  data: Record<string, unknown> | unknown[]
  config?: Record<string, unknown>
  onInteraction?: (event: Record<string, unknown>) => void
  className?: string
}

export interface ComponentUsage {
  timesGenerated: number
  averageRating: number
  successRate: number
  commonQueries: string[]
}

export interface PerformanceMetrics {
  renderTime: number
  memoryUsage: number
  bundleSize: number
  accessibilityScore: number
}

// Error Types
export interface V0GenerationError {
  code: 'RATE_LIMIT' | 'INVALID_PROMPT' | 'GENERATION_FAILED' | 'PARSING_ERROR' | 'API_ERROR'
  message: string
  details?: Record<string, unknown>
  retryable: boolean
  retryAfter?: number
}

// Cache Types
export interface GenerationCache {
  key: string
  component: GeneratedComponent
  context: ChartGenerationContext
  expiresAt: number
  hitCount: number
}

export interface CacheStats {
  hits: number
  misses: number
  hitRate: number
  size: number
  avgGenerationTime: number
} 