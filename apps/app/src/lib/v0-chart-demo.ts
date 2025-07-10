/**
 * v0 Platform API Chart Generation - Demo & Usage Examples
 * 
 * This file demonstrates how the v0 Platform API integration works for
 * generating dynamic chart components based on user queries.
 */

// Example 1: Simple Price Chart Generation
export const EXAMPLE_SIMPLE_CHART = {
  userQuery: "Show me Bitcoin price for the last 24 hours",
  coinData: [
    {
      id: 1,
      name: "Bitcoin",
      symbol: "BTC",
      quote: {
        USD: {
          price: 45000,
          percent_change_24h: 2.5,
          market_cap: 900000000000,
          volume_24h: 25000000000
        }
      }
    }
  ],
  expectedTemplate: "price_line",
  expectedOutput: "A clean line chart showing BTC price movements with green coloring for positive change"
}

// Example 2: Multi-Coin Comparison
export const EXAMPLE_COMPARISON_CHART = {
  userQuery: "Compare Bitcoin, Ethereum, and Solana performance this week",
  coinData: [
    {
      id: 1,
      name: "Bitcoin",
      symbol: "BTC",
      quote: {
        USD: {
          price: 45000,
          percent_change_24h: 2.5,
          market_cap: 900000000000,
          volume_24h: 25000000000
        }
      }
    },
    {
      id: 1027,
      name: "Ethereum", 
      symbol: "ETH",
      quote: {
        USD: {
          price: 3000,
          percent_change_24h: -1.2,
          market_cap: 400000000000,
          volume_24h: 15000000000
        }
      }
    },
    {
      id: 5426,
      name: "Solana",
      symbol: "SOL", 
      quote: {
        USD: {
          price: 150,
          percent_change_24h: 5.8,
          market_cap: 50000000000,
          volume_24h: 2000000000
        }
      }
    }
  ],
  expectedTemplate: "comparison_multi",
  expectedOutput: "Multi-line chart with 3 colored lines showing relative performance"
}

// Example 3: Technical Analysis Request
export const EXAMPLE_TECHNICAL_CHART = {
  userQuery: "Generate an advanced Bitcoin chart with RSI and MACD indicators",
  coinData: [
    {
      id: 1,
      name: "Bitcoin",
      symbol: "BTC",
      quote: {
        USD: {
          price: 45000,
          percent_change_24h: 2.5,
          market_cap: 900000000000,
          volume_24h: 25000000000
        }
      }
    }
  ],
  expectedTemplate: "technical_indicators",
  expectedOutput: "Candlestick chart with RSI oscillator below and MACD indicator overlay"
}

// Example 4: Market Overview Dashboard
export const EXAMPLE_MARKET_OVERVIEW = {
  userQuery: "Show me a crypto market overview dashboard with top 10 coins",
  coinData: [
    // Top 10 coins would be fetched dynamically
  ],
  expectedTemplate: "market_overview", 
  expectedOutput: "Dashboard with treemap, heatmap, and stats showing market overview"
}

/**
 * Usage Examples in Chat Interface
 */
export const CHAT_INTEGRATION_EXAMPLES = [
  {
    userMessage: "Create a custom chart comparing DeFi tokens",
    triggerConditions: [
      "Contains 'create' or 'generate'",
      "Multiple coins detected",
      "Custom visualization needed"
    ],
    flow: [
      "1. Enhanced intent detector analyzes query",
      "2. Data orchestrator fetches DeFi token data", 
      "3. shouldGenerateChart() returns true",
      "4. v0 API generates custom comparison chart",
      "5. Chart component rendered in chat"
    ]
  },
  {
    userMessage: "Build an advanced Bitcoin technical analysis view",
    triggerConditions: [
      "Contains 'build' or 'advanced'",
      "Technical analysis mentioned",
      "Deep analysis depth"
    ],
    flow: [
      "1. Intent detection identifies technical analysis request",
      "2. Data orchestrator fetches OHLCV and technical data",
      "3. v0 generates technical_indicators template",
      "4. Professional trading chart with indicators created"
    ]
  }
]

/**
 * API Endpoint Usage
 */
export const API_USAGE_EXAMPLES = {
  // Test the prompt generation without calling v0
  preview: {
    method: "POST",
    endpoint: "/api/v0/generate-chart",
    body: {
      query: "Compare Bitcoin and Ethereum",
      coinData: EXAMPLE_COMPARISON_CHART.coinData,
      options: {
        preview: true // Returns prompt and context instead of generating
      }
    },
    response: {
      success: true,
      preview: true,
      template: "comparison_multi",
      prompt: "Create an advanced multi-cryptocurrency comparison chart...",
      context: {
        intent: {
          primary: "comparison",
          focus: "price", 
          complexity: "moderate"
        },
        dataContext: {
          coinCount: 2,
          dataQuality: "high",
          availableMetrics: ["price", "volume_24h", "market_cap", "percent_change_24h"]
        }
      }
    }
  },

  // Generate actual chart (requires V0_API_KEY)
  generate: {
    method: "POST", 
    endpoint: "/api/v0/generate-chart",
    body: {
      query: "Create a Bitcoin price chart with volume",
      coinData: EXAMPLE_SIMPLE_CHART.coinData,
      options: {
        chartType: "custom",
        timeframe: "24h"
      }
    },
    response: {
      success: true,
      component: {
        code: "// Generated React component code",
        files: [
          {
            path: "GeneratedChart.tsx",
            content: "// React component with lightweight-charts",
            type: "component"
          }
        ],
        dependencies: ["react", "lightweight-charts", "@number-flow/react"],
        metadata: {
          name: "GeneratedChart_1234567890",
          template: "price_line",
          generatedAt: 1234567890
        }
      },
      usage: {
        tokensUsed: 1500,
        responseTime: 3000
      }
    }
  }
}

/**
 * Prompt Engineering Examples
 */
export const PROMPT_EXAMPLES = {
  priceLinePrompt: `
Create a sophisticated price line chart component for cryptocurrency data using lightweight-charts.

**Requirements:**
- Use lightweight-charts library with LineSeries  
- Display 1 cryptocurrency prices over time
- Implement smooth price animations with NumberFlow
- Include hover tooltips with price, change, and timestamp
- Support both positive (green) and negative (red) price changes
- Use Tailwind CSS with zinc color palette
- Make it responsive and performant

**Data Structure:**
{
  "coinCount": 1,
  "dataQuality": "high",
  "timeRange": "24h",
  "availableMetrics": ["price", "volume_24h", "market_cap", "percent_change_24h"]
}

**Design System:**
- Background: zinc-950/30
- Colors: #10b981, #ef4444, #3b82f6, #f59e0b, #8b5cf6, #06b6d4, #f97316, #84cc16
- Typography: font-mono
- Responsive design with mobile-first approach

[Additional context and requirements...]
  `,

  comparisonPrompt: `
Create an advanced multi-cryptocurrency comparison chart using lightweight-charts.

**Requirements:**
- Compare 3 cryptocurrencies simultaneously
- Use percentage-based normalization for fair comparison
- Each coin gets a unique color from the design system
- Interactive legend with coin selection/deselection
- Crosshair with multi-coin price display
- Performance optimized for multiple data series

[Detailed specifications continue...]
  `
}

/**
 * Benefits of v0 Integration
 */
export const INTEGRATION_BENEFITS = {
  "Eliminates Boilerplate": "No need to manually create chart components for every variation",
  "Dynamic Generation": "Charts generated on-demand based on user queries",
  "Advanced Queries": "Handles complex requests that don't fit predefined components", 
  "Consistent Design": "All generated charts follow your design system",
  "Performance": "Intelligent caching reduces redundant generations",
  "Maintainability": "Prompt templates are easier to update than React components",
  "User Experience": "Users get exactly what they ask for, not generic charts"
}

/**
 * Setup Instructions
 */
export const SETUP_INSTRUCTIONS = {
  "1. Environment Setup": "Add V0_API_KEY to your environment variables",
  "2. API Key": "Get your v0 Platform API key from v0.dev",
  "3. Testing": "Use preview mode to test prompt generation without API calls",
  "4. Integration": "Enhanced chat handler automatically triggers v0 generation for complex queries",
  "5. Fallbacks": "System gracefully falls back to standard components if generation fails"
}

/**
 * Next Steps & Improvements
 */
export const FUTURE_ENHANCEMENTS = [
  "Implement real v0 SDK integration once API structure is finalized",
  "Add component caching and versioning",
  "Create component gallery for reusing generated charts",
  "Add A/B testing for different prompt variations", 
  "Implement user feedback collection for generated charts",
  "Add support for custom styling and themes",
  "Create analytics dashboard for generation metrics"
] 