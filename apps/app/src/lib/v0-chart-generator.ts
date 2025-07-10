import { v0 } from 'v0-sdk'
import type { 
  V0GenerationRequest,
  V0GenerationResponse,
  GeneratedComponent,
  ChartGenerationContext,
  GenerationIntent,
  ChartDataContext,
  V0GenerationError,
  GenerationCache,
  CacheStats,
  ComponentMetadata,
  ComponentFile
} from '../types/v0-chart-generation'
import type { CoinMarketData } from '../types/coins'
import { 
  selectBestTemplate, 
  buildChartPrompt, 
  DEFAULT_DESIGN_SYSTEM 
} from './v0-chart-prompts'

export class V0ChartGeneratorService {
  private v0Client: typeof v0
  private cache = new Map<string, GenerationCache>()
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    size: 0,
    avgGenerationTime: 0
  }

  constructor(apiKey?: string) {
    if (!apiKey) {
      throw new Error('V0_API_KEY is required for chart generation')
    }
    
    this.v0Client = v0
  }

  /**
   * Main entry point for generating chart components
   */
  async generateChart(request: V0GenerationRequest): Promise<V0GenerationResponse> {
    const startTime = Date.now()
    
    try {
      console.log('🎨 Starting v0 chart generation for:', request.query)

      // Build generation context
      const context = this.buildGenerationContext(request)
      
      // Check cache first
      const cacheKey = this.generateCacheKey(context)
      const cached = this.getFromCache(cacheKey)
      
      if (cached) {
        console.log('📦 Cache hit for chart generation')
        this.stats.hits++
        this.updateStats()
        
        return {
          success: true,
          component: cached.component,
          usage: {
            tokensUsed: 0, // Cached, no tokens used
            responseTime: Date.now() - startTime
          }
        }
      }

      // Generate new component
      this.stats.misses++
      const result = await this.generateNewComponent(context)
      
      // Cache the result
      if (result.success && result.component) {
        this.addToCache(cacheKey, result.component, context)
      }

      const responseTime = Date.now() - startTime
      console.log(`✅ Chart generation completed in ${responseTime}ms`)
      
      this.updateStats()
      return {
        ...result,
        usage: {
          tokensUsed: result.usage?.tokensUsed || 0,
          responseTime
        }
      }

    } catch (error) {
      console.error('❌ Chart generation failed:', error)
      return this.handleGenerationError(error as Record<string, unknown>, Date.now() - startTime)
    }
  }

  /**
   * Generate a new component using v0 Platform API
   */
  private async generateNewComponent(context: ChartGenerationContext): Promise<V0GenerationResponse> {
    // Select the best template for this request
    const template = selectBestTemplate(
      context.intent,
      context.dataContext,
      context.userQuery
    )

    // Build the optimized prompt
    const prompt = buildChartPrompt(template, {
      intent: context.intent,
      dataContext: context.dataContext,
      designSystem: context.designSystem,
      userQuery: context.userQuery
    })

    console.log('🔧 Using template:', template.name)
    console.log('📝 Generated prompt length:', prompt.length)

    try {
      // Create a v0 chat session
      const chatResponse = await this.v0Client.chats.create({
        message: prompt
      })

      // Parse the generated code
      const parsedComponent = await this.parseV0Response(chatResponse as Record<string, unknown>)
      
      // Frame creation not available in current v0 SDK
      const previewUrl: string | undefined = undefined

      return {
        success: true,
        component: parsedComponent,
        previewUrl,
        usage: {
          tokensUsed: 0, // v0 SDK doesn't expose token usage
          responseTime: 0 // Will be set by caller
        }
      }

    } catch (error) {
      console.error('❌ v0 API call failed:', error)
      throw error
    }
  }

  /**
   * Parse v0 API response into our component structure
   */
  private async parseV0Response(response: Record<string, unknown>): Promise<GeneratedComponent> {
    // Extract the code from v0 response
    const extractedCode = this.extractCodeFromResponse(response)
    
    // Parse into files
    const files = this.parseCodeIntoFiles(extractedCode)
    
    // Extract dependencies
    const dependencies = this.extractDependencies(extractedCode)
    
    // Generate metadata
    const metadata: ComponentMetadata = {
      name: this.generateComponentName(),
      description: 'Generated chart component via v0 Platform API',
      chartType: 'custom',
      dataSource: 'v0-generated',
      generatedAt: Date.now(),
      version: '1.0.0'
    }

    return {
      code: extractedCode,
      files,
      dependencies,
      metadata
    }
  }

  /**
   * Extract React component code from v0 response
   */
  private extractCodeFromResponse(response: Record<string, unknown>): string {
    // v0 typically returns code in a structured format
    // This is a simplified version - actual implementation would depend on v0's response format
    if (response.content) {
      // Look for code blocks in markdown
      const codeBlockRegex = /```(?:tsx?|jsx?)\n([\s\S]*?)```/g
      const matches = [...String(response.content).matchAll(codeBlockRegex)]
      
      if (matches.length > 0) {
        return matches[0]?.[1] || ''
      }
      
      // Fallback to full content
      return String(response.content)
    }
    
    const message = response.message as Record<string, unknown>
    return String(message?.content || response.text || '')
  }

  /**
   * Parse extracted code into separate files
   */
  private parseCodeIntoFiles(code: string): ComponentFile[] {
    // For now, treat as a single component file
    // In a more sophisticated implementation, you could parse multiple files
    return [
      {
        path: 'GeneratedChart.tsx',
        content: code,
        type: 'component' as const
      }
    ]
  }

  /**
   * Extract dependencies from the generated code
   */
  private extractDependencies(code: string): string[] {
    const dependencies = new Set<string>()
    
    // Extract import statements
    const importRegex = /import.*?from\s+['"]([^'"]+)['"]/g
    let match
    
    while ((match = importRegex.exec(code)) !== null) {
      const importPath = match[1]
      
      // Skip relative imports
      if (importPath && !importPath.startsWith('.') && !importPath.startsWith('/')) {
        dependencies.add(importPath)
      }
    }
    
    // Add common dependencies that are likely needed
    dependencies.add('react')
    dependencies.add('lightweight-charts')
    dependencies.add('@number-flow/react')
    
    return Array.from(dependencies)
  }

  /**
   * Build generation context from request
   */
  private buildGenerationContext(request: V0GenerationRequest): ChartGenerationContext {
    // Analyze intent from query and data
    const intent: GenerationIntent = this.analyzeIntent(request)
    
    // Build data context
    const dataContext: ChartDataContext = this.buildDataContext(request.data)
    
    // Use provided design system or default
    const designSystem = DEFAULT_DESIGN_SYSTEM

    return {
      userQuery: request.query,
      intent,
      dataContext,
      designSystem,
      constraints: {
        maxComplexity: 8,
        allowedLibraries: ['lightweight-charts', 'recharts', '@number-flow/react'],
        performanceTargets: {
          maxRenderTime: 100,
          maxMemoryUsage: 50
        },
        accessibility: true
      }
    }
  }

  /**
   * Analyze user intent from the request
   */
  private analyzeIntent(request: V0GenerationRequest): GenerationIntent {
    const query = request.query.toLowerCase()
    const coinCount = request.data.length

    // Determine primary intent
    let primary: GenerationIntent['primary'] = 'overview'
    if (query.includes('compare') || coinCount > 1) {
      primary = 'comparison'
    } else if (query.includes('technical') || query.includes('indicator')) {
      primary = 'analysis'
    } else if (query.includes('deep') || query.includes('detailed')) {
      primary = 'deep_dive'
    }

    // Determine focus
    let focus: GenerationIntent['focus'] = 'price'
    if (query.includes('volume')) focus = 'volume'
    else if (query.includes('technical') || query.includes('rsi') || query.includes('macd')) focus = 'technical'
    else if (query.includes('market cap') || query.includes('fundamental')) focus = 'fundamental'

    // Determine complexity
    let complexity: GenerationIntent['complexity'] = 'moderate'
    if (query.includes('simple') || query.includes('basic')) complexity = 'simple'
    else if (query.includes('advanced') || query.includes('professional')) complexity = 'advanced'

    return {
      primary,
      focus,
      timeframe: 'short', // Default for crypto
      complexity
    }
  }

  /**
   * Build data context from coin data
   */
  private buildDataContext(data: CoinMarketData[]): ChartDataContext {
    const availableMetrics = ['price', 'volume_24h', 'market_cap', 'percent_change_24h']
    
    // Check for additional metrics based on data
    const firstCoin = data[0]
    if (firstCoin) {
      // Add metrics that exist in the data
      if (firstCoin.quote?.USD?.percent_change_7d) availableMetrics.push('change_7d')
      if (firstCoin.quote?.USD?.percent_change_30d) availableMetrics.push('change_30d')
    }

    return {
      coinCount: data.length,
      dataQuality: data.length > 0 && data[0]?.quote?.USD ? 'high' : 'medium',
      timeRange: '24h', // Default
      availableMetrics,
      missingData: []
    }
  }

  /**
   * Cache management methods
   */
  private generateCacheKey(context: ChartGenerationContext): string {
    return `v0-chart-${JSON.stringify({
      query: context.userQuery,
      intent: context.intent,
      coinCount: context.dataContext.coinCount,
      metrics: context.dataContext.availableMetrics.sort()
    })}`
  }

  private getFromCache(key: string): GenerationCache | null {
    const cached = this.cache.get(key)
    if (!cached) return null
    
    // Check if expired
    if (cached.expiresAt < Date.now()) {
      this.cache.delete(key)
      return null
    }
    
    cached.hitCount++
    return cached
  }

  private addToCache(key: string, component: GeneratedComponent, context: ChartGenerationContext): void {
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    
    this.cache.set(key, {
      key,
      component,
      context,
      expiresAt,
      hitCount: 0
    })
    
    // Clean up old entries if cache gets too large
    if (this.cache.size > 100) {
      this.cleanupCache()
    }
  }

  private cleanupCache(): void {
    const now = Date.now()
    const entries = Array.from(this.cache.entries())
    
    // Sort by hit count and age, remove least used
    entries
      .filter(([, cache]) => cache.expiresAt < now)
      .forEach(([key]) => this.cache.delete(key))
    
    // If still too large, remove oldest entries
    if (this.cache.size > 100) {
      const sortedEntries = entries.sort((a, b) => a[1].hitCount - b[1].hitCount)
      const toRemove = sortedEntries.slice(0, this.cache.size - 80)
      toRemove.forEach(([key]) => this.cache.delete(key))
    }
  }

  private updateStats(): void {
    this.stats.size = this.cache.size
    this.stats.hitRate = this.stats.hits / (this.stats.hits + this.stats.misses)
  }

  /**
   * Error handling
   */
  private handleGenerationError(error: Record<string, unknown>, responseTime: number): V0GenerationResponse {
    let generationError: V0GenerationError
    
    if (error.status === 429) {
      generationError = {
        code: 'RATE_LIMIT',
        message: 'Rate limit exceeded. Please try again later.',
        retryable: true,
        retryAfter: Number(error.retryAfter) || 60
      }
    } else if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
      generationError = {
        code: 'INVALID_PROMPT',
        message: 'Invalid request or prompt format',
        retryable: false
      }
    } else {
      generationError = {
        code: 'GENERATION_FAILED',
        message: String(error.message) || 'Chart generation failed',
        retryable: true
      }
    }

    return {
      success: false,
      error: generationError.message,
      usage: {
        tokensUsed: 0,
        responseTime
      }
    }
  }

  /**
   * Utility methods
   */
  private generateComponentName(): string {
    return `GeneratedChart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Public API methods
   */
  async generateChartFromQuery(
    query: string, 
    coinData: CoinMarketData[], 
    options?: {
      chartType?: string
      timeframe?: string
      preferences?: Record<string, unknown>
    }
  ): Promise<V0GenerationResponse> {
    const request: V0GenerationRequest = {
      query,
      chartType: 'custom',
      data: coinData,
      timeframe: options?.timeframe,
      preferences: undefined // ChartPreferences type mismatch
    }

    return this.generateChart(request)
  }

  getCacheStats(): CacheStats {
    return { ...this.stats }
  }

  clearCache(): void {
    this.cache.clear()
    this.stats.size = 0
  }
}

// Factory function for easy instantiation
export function createV0ChartGenerator(apiKey?: string): V0ChartGeneratorService {
  const key = apiKey || process.env.V0_API_KEY
  if (!key) {
    throw new Error('V0_API_KEY environment variable is required')
  }
  
  return new V0ChartGeneratorService(key)
}

// Singleton instance for app-wide use
export const v0ChartGenerator = createV0ChartGenerator() 