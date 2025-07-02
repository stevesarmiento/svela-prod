'use client'

import { generatePastelColors } from '../../lib/chart-colors'

// Generate consistent pastel colors for MarketVision configuration
const CONFIG_COLORS = generatePastelColors(9)

export interface Time {
  time: number
}

export interface OHLCVDataPoint extends Time {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface SeriesDataPoint extends Time {
  value: number
}

// Individual component configs
export interface OscillatorConfig {
  show: boolean
  type: 'RSI' | 'MFI' | 'Ultimate Oscillator' | 'Williams %R' | 'Double RSI'
  length: number
  source: 'close' | 'open' | 'high' | 'low' | 'hlc3'
  overbought: number
  oversold: number
  color: string
}

export interface StochasticConfig {
  show: boolean
  type: 'Stochastic - Standard' | 'RSI Stochastic'
  source: 'Price' | 'Volume - On Balance Volume' | 'Volume - On Balance Volume - Locked to Standard Candles'
  showType: 'K and D' | 'K Only' | 'D Only' | 'Double Stochastic - K and D + Long Term RSI Stochastic K - Set Value: 14, 14, 3, 3' | 'Double Stochastic - K and D + Long Term Stochastic D - Set Value: 21, 4, 10'
  kPeriod: number
  dPeriod: number
  smoothing: number
  kColor: string
  dColor: string
  rsiLength: number
  stochLength: number
  kSmoothing: number
  dSmoothing: number
  doubleStochK: number
  doubleStochD: number
  doubleStochSmoothing: number
  doubleRSIStochRSI: number
  doubleRSIStochLength: number
  doubleRSIStochKSmoothing: number
  doubleRSIStochDSmoothing: number
  brightness: number
}

export interface WaveTrendConfig {
  show: boolean
  source: 'hlc3' | 'close' | 'open' | 'high' | 'low'
  channelLength: number
  averageLength: number
  overbought: number
  oversold: number
  veryOverbought: number
  veryOversold: number
  showZeroCrossing: boolean
  showOBOSDuplication: boolean
  showDelta: boolean
  deltaOutlineOnly: boolean
  color1: string
  color2: string
  outlineColor: string
  brightness: number
}

export interface MoneyFlowConfig {
  show: boolean
  showFast: boolean
  showSlow: boolean
  type: 'Pine Script RSI+MFI' | 'Chaikin Money Flow' | 'Dynamic Money Flow' | 'MFI' | 'VWMA' | 'RSI' | 'RSI.Signal Line - Set Value - RSI 13, Signal Line (Linear Regression) 21' | 'DEMA' | 'EMA' | 'HullMA' | 'SMA' | 'SMMA' | 'SSMA' | 'TEMA' | 'TMA' | 'WMA' | 'ZEMA'
  multiplier: number
  maLength: number
  oscLength: number
  fillArea: boolean
  brightness: number
  yOffset: number
  fastColor: string
  slowColor: string
}

// Main MarketVision B Configuration
export interface MarketVisionBConfig {
  // Oscillator Settings
  oscillator1: OscillatorConfig
  oscillator2: OscillatorConfig
  
  // Wave Trend Settings
  waveTrend: WaveTrendConfig
  
  // Money Flow Settings
  moneyFlow: MoneyFlowConfig
  
  // Stochastic Settings
  stochastic: StochasticConfig
  
  // Display Settings
  display: {
    showLevels: boolean
    showBackground: boolean
    showLabels: boolean
    transparency: number
  }
}

// Results Interface
export interface MarketVisionBResult {
  oscillator1: SeriesDataPoint[]
  oscillator2: SeriesDataPoint[]
  waveTrend: {
    wt1: SeriesDataPoint[]
    wt2: SeriesDataPoint[]
    delta: SeriesDataPoint[]
    positiveCrosses: SeriesDataPoint[]
    negativeCrosses: SeriesDataPoint[]
    zeroCrosses: SeriesDataPoint[]
    obPositiveCrosses: SeriesDataPoint[]
    obNegativeCrosses: SeriesDataPoint[]
    osPositiveCrosses: SeriesDataPoint[]
    osNegativeCrosses: SeriesDataPoint[]
    trendFilter: {
      positive: boolean[]
      negative: boolean[]
    }
    colors: {
      wt1Outline: string
      wt1Area: string
      wt2Area: string
      deltaArea: string
      fillArea: string
    }
  }
  moneyFlow: {
    fast: SeriesDataPoint[]
    slow: SeriesDataPoint[]
    direction: SeriesDataPoint[]
    moneyFlowValue: number[]
  }
  levels: {
    zero: SeriesDataPoint[]
    overbought1: SeriesDataPoint[]
    oversold1: SeriesDataPoint[]
    overbought2: SeriesDataPoint[]
    oversold2: SeriesDataPoint[]
  }
}

// Default Configuration
export const DEFAULT_MARKET_VISION_CONFIG: MarketVisionBConfig = {
  oscillator1: {
    show: true,
    type: 'RSI',
    length: 14,
    source: 'close',
    overbought: 70,
    oversold: 30,
    color: CONFIG_COLORS[0] || 'hsl(210, 40%, 75%)'  // Soft blue
  },
  oscillator2: {
    show: true,
    type: 'MFI',
    length: 14,
    source: 'hlc3',
    overbought: 80,
    oversold: 20,
    color: CONFIG_COLORS[1] || 'hsl(340, 45%, 78%)'  // Soft pink
  },
  waveTrend: {
    show: true,
    source: 'hlc3',
    channelLength: 6,
    averageLength: 3,
    overbought: 50,
    oversold: -50,
    veryOverbought: 70,
    veryOversold: -70,
    showZeroCrossing: false,
    showOBOSDuplication: true,
    showDelta: false,
    deltaOutlineOnly: false,
    color1: CONFIG_COLORS[2] || 'hsl(160, 42%, 72%)',  // Soft green
    color2: CONFIG_COLORS[3] || 'hsl(45, 55%, 78%)',   // Soft yellow
    outlineColor: '#FFFFFF',
    brightness: 100
  },
  moneyFlow: {
    show: true,
    showFast: true,
    showSlow: false,
    type: 'Pine Script RSI+MFI',
    multiplier: 150,
    maLength: 60,
    oscLength: 26,
    fillArea: false,
    brightness: 100,
    yOffset: 2.5,
    fastColor: CONFIG_COLORS[4] || 'hsl(280, 40%, 75%)',  // Soft purple
    slowColor: CONFIG_COLORS[5] || 'hsl(15, 50%, 76%)'    // Soft coral
  },
  stochastic: {
    show: true,
    type: 'Stochastic - Standard',
    source: 'Price',
    showType: 'K and D',
    kPeriod: 6,
    dPeriod: 3,
    smoothing: 3,
    kColor: CONFIG_COLORS[6] || 'hsl(190, 45%, 72%)',      // Soft cyan
    dColor: CONFIG_COLORS[7] || 'hsl(120, 38%, 72%)',      // Soft sage
    rsiLength: 13,
    stochLength: 13,
    kSmoothing: 3,
    dSmoothing: 3,
    doubleStochK: 21,
    doubleStochD: 4,
    doubleStochSmoothing: 10,
    doubleRSIStochRSI: 14,
    doubleRSIStochLength: 14,
    doubleRSIStochKSmoothing: 3,
    doubleRSIStochDSmoothing: 3,
    brightness: 100
  },
  display: {
    showLevels: true,
    showBackground: true,
    showLabels: true,
    transparency: 80
  }
}

// Export as both the default and as marketVisionConfig for backward compatibility
export const marketVisionConfig = DEFAULT_MARKET_VISION_CONFIG

// Default colors
export const DEFAULT_MARKET_VISION_COLORS = {
  oscillator1: CONFIG_COLORS[0] || 'hsl(210, 40%, 75%)',    // Soft blue
  oscillator2: CONFIG_COLORS[1] || 'hsl(340, 45%, 78%)',    // Soft pink
  stochasticK: CONFIG_COLORS[6] || 'hsl(190, 45%, 72%)',    // Soft cyan
  stochasticD: CONFIG_COLORS[7] || 'hsl(120, 38%, 72%)',    // Soft sage
  waveTrend1: CONFIG_COLORS[2] || 'hsl(160, 42%, 72%)',     // Soft green
  waveTrend2: CONFIG_COLORS[3] || 'hsl(45, 55%, 78%)',      // Soft yellow
  waveTrendDelta: CONFIG_COLORS[8] || 'hsl(200, 40%, 75%)', // Soft sky blue
  moneyFlowFast: CONFIG_COLORS[4] || 'hsl(280, 40%, 75%)',  // Soft purple
  moneyFlowSlow: CONFIG_COLORS[5] || 'hsl(15, 50%, 76%)'    // Soft coral
}