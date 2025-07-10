import type { 
  ChartPromptTemplate, 
  ChartType, 
  GenerationIntent,
  DesignSystemConfig,
  ChartDataContext
} from '../types/v0-chart-generation'

// Design System Constants
export const DEFAULT_DESIGN_SYSTEM: DesignSystemConfig = {
  baseColors: {
    background: 'zinc-950/30',
    foreground: 'white',
    border: 'zinc-800/30',
    accent: 'zinc-700/50'
  },
  chartColors: [
    '#10b981', // emerald-500
    '#ef4444', // red-500
    '#3b82f6', // blue-500
    '#f59e0b', // amber-500
    '#8b5cf6', // violet-500
    '#06b6d4', // cyan-500
    '#f97316', // orange-500
    '#84cc16'  // lime-500
  ],
  typography: {
    fontFamily: 'font-mono',
    sizes: {
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg'
    }
  },
  spacing: {
    xs: 'p-2',
    sm: 'p-3',
    base: 'p-4',
    lg: 'p-6'
  },
  borderRadius: 'rounded-lg'
}

// Core Prompt Templates
export const CHART_PROMPT_TEMPLATES: ChartPromptTemplate[] = [
  {
    id: 'price_line',
    name: 'Price Line Chart',
    chartType: 'price_line',
    template: `
Create a sophisticated price line chart component for cryptocurrency data using lightweight-charts.

**Requirements:**
- Use lightweight-charts library with LineSeries
- Display {COIN_COUNT} cryptocurrency prices over time
- Implement smooth price animations with NumberFlow
- Include hover tooltips with price, change, and timestamp
- Support both positive (green) and negative (red) price changes
- Use Tailwind CSS with zinc color palette
- Make it responsive and performant

**Data Structure:**
{DATA_STRUCTURE}

**Design System:**
- Background: {BACKGROUND}
- Colors: {CHART_COLORS}
- Typography: {TYPOGRAPHY}
- Responsive design with mobile-first approach

**Component Features:**
- Clean, minimal chart with transparent background
- Auto-resize handling
- Price formatting with appropriate decimal places
- Loading states with skeleton UI
- Error boundaries for data issues

**Example Usage:**
\`\`\`tsx
<GeneratedPriceChart 
  data={coinData} 
  timeframe="24h"
  showVolume={false}
  className="w-full h-64"
/>
\`\`\`

Generate a complete React component with TypeScript that follows these specifications.
    `,
    variables: ['COIN_COUNT', 'DATA_STRUCTURE', 'BACKGROUND', 'CHART_COLORS', 'TYPOGRAPHY'],
    examples: [
      {
        query: 'Show me Bitcoin price over the last 24 hours',
        expectedOutput: 'A clean line chart showing BTC price movements with green/red coloring based on change',
        dataStructure: { id: 1, name: 'Bitcoin', symbol: 'BTC', price: 45000, change24h: 2.5 }
      }
    ]
  },
  {
    id: 'comparison_multi',
    name: 'Multi-Coin Comparison',
    chartType: 'comparison_multi',
    template: `
Create an advanced multi-cryptocurrency comparison chart using lightweight-charts.

**Requirements:**
- Compare {COIN_COUNT} cryptocurrencies simultaneously
- Use percentage-based normalization for fair comparison
- Each coin gets a unique color from the design system
- Interactive legend with coin selection/deselection
- Crosshair with multi-coin price display
- Performance optimized for multiple data series

**Data Structure:**
{DATA_STRUCTURE}

**Chart Features:**
- Percentage change normalization (baseline at 0%)
- Individual series for each cryptocurrency
- Dynamic legend with coin icons and current values
- Zoom and pan capabilities
- Mobile-responsive design

**Technical Implementation:**
- Use lightweight-charts with multiple LineSeries
- Implement efficient data transformation
- Handle missing data points gracefully
- Smooth animations and transitions
- Proper memory management for chart cleanup

**Styling:**
- Background: {BACKGROUND}
- Chart Colors: {CHART_COLORS}
- Border styling: {BORDER}
- Typography: {TYPOGRAPHY}

Generate a production-ready React component with full TypeScript support.
    `,
    variables: ['COIN_COUNT', 'DATA_STRUCTURE', 'BACKGROUND', 'CHART_COLORS', 'BORDER', 'TYPOGRAPHY'],
    examples: [
      {
        query: 'Compare Bitcoin, Ethereum, and Solana performance this week',
        expectedOutput: 'Multi-line chart with 3 colored lines showing relative performance',
        dataStructure: {
          coins: [
            { id: 1, name: 'Bitcoin', symbol: 'BTC' },
            { id: 1027, name: 'Ethereum', symbol: 'ETH' },
            { id: 5426, name: 'Solana', symbol: 'SOL' }
          ]
        }
      }
    ]
  },
  {
    id: 'technical_indicators',
    name: 'Technical Analysis Chart',
    chartType: 'technical_indicators',
    template: `
Create a comprehensive technical analysis chart with multiple indicators.

**Requirements:**
- OHLCV candlestick chart as the base
- Overlay technical indicators: {INDICATORS}
- Volume histogram below the main chart
- Configurable indicator settings
- Professional trading interface styling

**Indicators to Implement:**
{INDICATOR_LIST}

**Data Structure:**
{DATA_STRUCTURE}

**Chart Configuration:**
- Main price area with candlesticks
- Volume area below (30% height)
- Indicator overlays with proper scaling
- Color coding for bullish/bearish signals
- Real-time updates support

**Technical Requirements:**
- Use lightweight-charts CandlestickSeries
- Implement proper indicator calculations
- Handle real-time data updates
- Memory efficient rendering
- Responsive design for all screen sizes

**Styling Specifications:**
- Professional dark theme
- Colors: {CHART_COLORS}
- Proper contrast ratios for accessibility
- Clean typography with {TYPOGRAPHY}

Generate a complete technical analysis component with indicator calculations.
    `,
    variables: ['INDICATORS', 'INDICATOR_LIST', 'DATA_STRUCTURE', 'CHART_COLORS', 'TYPOGRAPHY'],
    examples: [
      {
        query: 'Show Bitcoin with RSI, MACD, and Bollinger Bands',
        expectedOutput: 'Candlestick chart with RSI oscillator below and Bollinger Bands overlay',
        dataStructure: { ohlcv: true, indicators: ['RSI', 'MACD', 'BB'] }
      }
    ]
  },
  {
    id: 'market_overview',
    name: 'Market Overview Dashboard',
    chartType: 'market_overview',
    template: `
Create a comprehensive market overview dashboard component.

**Requirements:**
- Display top {COIN_COUNT} cryptocurrencies
- Market cap treemap visualization
- Performance heatmap
- Summary statistics cards
- Real-time price tickers

**Layout Structure:**
1. Header with market stats (total market cap, 24h volume, dominance)
2. Treemap showing market cap proportions
3. Performance heatmap (7d, 30d changes)
4. Quick stats grid with top gainers/losers

**Data Visualization:**
- Treemap using recharts TreemapChart
- Color coding based on performance
- Interactive hover states
- Responsive grid layout

**Data Structure:**
{DATA_STRUCTURE}

**Styling:**
- Modern dashboard aesthetic
- Card-based layout with subtle shadows
- Color scheme: {CHART_COLORS}
- Typography: {TYPOGRAPHY}
- Responsive breakpoints

**Interactive Features:**
- Hover details for each asset
- Click to navigate to detailed view
- Sorting and filtering options
- Real-time price updates

Generate a complete market overview dashboard component.
    `,
    variables: ['COIN_COUNT', 'DATA_STRUCTURE', 'CHART_COLORS', 'TYPOGRAPHY'],
    examples: [
      {
        query: 'Show me the crypto market overview with top 20 coins',
        expectedOutput: 'Dashboard with treemap, heatmap, and stats showing market overview',
        dataStructure: { coins: 20, includeMarketCap: true, includeVolume: true }
      }
    ]
  }
]

// Prompt Builder Functions
export function buildChartPrompt(
  template: ChartPromptTemplate,
  context: {
    intent: GenerationIntent
    dataContext: ChartDataContext
    designSystem: DesignSystemConfig
    userQuery: string
  }
): string {
  let prompt = template.template

  // Replace template variables
  const variables = {
    COIN_COUNT: context.dataContext.coinCount.toString(),
    DATA_STRUCTURE: JSON.stringify(context.dataContext, null, 2),
    BACKGROUND: context.designSystem.baseColors.background,
    CHART_COLORS: context.designSystem.chartColors.join(', '),
    BORDER: context.designSystem.baseColors.border,
    TYPOGRAPHY: context.designSystem.typography.fontFamily,
    INDICATORS: context.dataContext.availableMetrics.join(', '),
    INDICATOR_LIST: context.dataContext.availableMetrics.map(i => `- ${i}`).join('\n'),
    USER_QUERY: context.userQuery
  }

  // Replace all variables in the template
  Object.entries(variables).forEach(([key, value]) => {
    prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  })

  // Add context-specific enhancements
  prompt += generateContextualEnhancements(context)

  return prompt
}

function generateContextualEnhancements(context: {
  intent: GenerationIntent
  dataContext: ChartDataContext
}): string {
  let enhancements = '\n\n**Additional Context:**\n'

  // Add complexity requirements
  if (context.intent.complexity === 'advanced') {
    enhancements += '- Include advanced interactions and customization options\n'
    enhancements += '- Implement professional-grade features\n'
  } else if (context.intent.complexity === 'simple') {
    enhancements += '- Keep the interface clean and minimal\n'
    enhancements += '- Focus on core functionality only\n'
  }

  // Add data quality considerations
  if (context.dataContext.dataQuality === 'low') {
    enhancements += '- Include robust error handling for missing data\n'
    enhancements += '- Implement fallback visualizations\n'
  }

  // Add performance considerations
  if (context.dataContext.coinCount > 10) {
    enhancements += '- Optimize for performance with large datasets\n'
    enhancements += '- Implement virtualization if needed\n'
  }

  enhancements += '\n**Code Quality Requirements:**\n'
  enhancements += '- Use TypeScript with proper type definitions\n'
  enhancements += '- Follow React best practices and hooks patterns\n'
  enhancements += '- Include proper error boundaries\n'
  enhancements += '- Implement accessibility features (ARIA labels, keyboard navigation)\n'
  enhancements += '- Use Tailwind CSS for styling\n'
  enhancements += '- Include loading states and skeleton UI\n'

  return enhancements
}

// Template Selection Logic
export function selectBestTemplate(
  intent: GenerationIntent,
  dataContext: ChartDataContext,
  userQuery: string
): ChartPromptTemplate {
  // Analyze user query for keywords
  const queryLower = userQuery.toLowerCase()
  
  // Check for specific chart type requests
  if (queryLower.includes('compare') || queryLower.includes('vs') || dataContext.coinCount > 1) {
    return CHART_PROMPT_TEMPLATES.find(t => t.id === 'comparison_multi')!
  }
  
  if (queryLower.includes('rsi') || queryLower.includes('macd') || queryLower.includes('technical')) {
    return CHART_PROMPT_TEMPLATES.find(t => t.id === 'technical_indicators')!
  }
  
  if (queryLower.includes('market') || queryLower.includes('overview') || queryLower.includes('dashboard')) {
    return CHART_PROMPT_TEMPLATES.find(t => t.id === 'market_overview')!
  }
  
  // Default to price line for single coin queries
  return CHART_PROMPT_TEMPLATES.find(t => t.id === 'price_line')!
}

// Utility Functions
export function validatePromptVariables(template: ChartPromptTemplate, variables: Record<string, string>): boolean {
  return template.variables.every(variable => variables[variable] !== undefined)
}

export function getTemplateById(id: string): ChartPromptTemplate | undefined {
  return CHART_PROMPT_TEMPLATES.find(template => template.id === id)
}

export function getTemplatesByChartType(chartType: ChartType): ChartPromptTemplate[] {
  return CHART_PROMPT_TEMPLATES.filter(template => template.chartType === chartType)
} 