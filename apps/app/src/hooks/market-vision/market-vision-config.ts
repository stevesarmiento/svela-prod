'use client'

import type { DivergenceType } from './divergence-engine'

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

export interface ColoredSeriesDataPoint extends SeriesDataPoint {
  color?: string
}

export interface VmcSourceCandle {
  open: number[]
  high: number[]
  low: number[]
  close: number[]
  hlc3: number[]
}

export type VmcSource = keyof VmcSourceCandle

export interface VmcWaveTrendSettings {
  wtShow: boolean
  wtBuyShow: boolean
  wtGoldShow: boolean
  wtSellShow: boolean
  wtDivShow: boolean
  vwapShow: boolean
  wtChannelLen: number
  wtAverageLen: number
  wtMASource: VmcSource
  wtMALen: number

  // Overbought & oversold levels (match Pine script)
  obLevel: number
  obLevel2: number
  obLevel3: number
  osLevel: number
  osLevel2: number
  osLevel3: number

  // Divergence WT
  wtShowDiv: boolean
  wtShowHiddenDiv: boolean
  showHiddenDiv_nl: boolean
  wtDivOBLevel: number
  wtDivOSLevel: number
  wtDivOBLevel_addshow: boolean
  wtDivOBLevel_add: number
  wtDivOSLevel_add: number
}

export interface VmcMfiSettings {
  rsiMFIShow: boolean
  rsiMFIperiod: number
  rsiMFIMultiplier: number
  rsiMFIPosY: number
}

export interface VmcRsiSettings {
  rsiShow: boolean
  rsiSRC: VmcSource
  rsiLen: number
  rsiOversold: number
  rsiOverbought: number

  // Divergence RSI
  rsiShowDiv: boolean
  rsiShowHiddenDiv: boolean
  rsiDivOBLevel: number
  rsiDivOSLevel: number
}

export interface VmcStochSettings {
  stochShow: boolean
  stochUseLog: boolean
  stochAvg: boolean
  stochSRC: VmcSource
  stochLen: number
  stochRsiLen: number
  stochKSmooth: number
  stochDSmooth: number

  // Divergence stoch
  stochShowDiv: boolean
  stochShowHiddenDiv: boolean
}

export interface VmcSchaffSettings {
  tcLine: boolean
  tcSRC: VmcSource
  tclength: number
  tcfastLength: number
  tcslowLength: number
  tcfactor: number
}

export interface VmcSommiFlagSettings {
  sommiFlagShow: boolean
  sommiShowVwap: boolean
  sommiVwapTF: string
  sommiVwapBearLevel: number
  sommiVwapBullLevel: number
  soomiFlagWTBearLevel: number
  soomiFlagWTBullLevel: number
  soomiRSIMFIBearLevel: number
  soomiRSIMFIBullLevel: number
}

export interface VmcSommiDiamondSettings {
  sommiDiamondShow: boolean
  sommiHTCRes: string
  sommiHTCRes2: string
  soomiDiamondWTBearLevel: number
  soomiDiamondWTBullLevel: number
}

export interface VmcSommiSettings {
  flag: VmcSommiFlagSettings
  diamond: VmcSommiDiamondSettings
}

export interface VmcMacdColorsSettings {
  macdWTColorsShow: boolean
  macdWTColorsTF: string
}

/**
 * Settings for the tolerance-pairing divergence engine (divergence-engine.ts)
 * that runs alongside the Pine-parity fractal detector. Unlike VMC's fractal
 * approach (price + oscillator pivot on the exact same bar), this pairs
 * independently-found pivots within `tolBars` bars — catching divergences the
 * original indicator misses. Output is additive (result.divergences); it does
 * not change the Pine-parity dots/signals.
 */
export interface VmcDivergenceEngineSettings {
  enabled: boolean
  leftBars: number
  rightBars: number
  pairMode: 'TV-like' | 'Same Bar'
  tolBars: number
  allowEqual: boolean
  priceEps: number
  oscEps: number
}

export interface VmcModeSettings {
  darkMode: boolean
}

export interface VmcColorSettings {
  // Core palette (defaults match Pine script constants)
  colorRed: string
  colorPurple: string
  colorGreen: string
  colorOrange: string
  colorYellow: string
  colorWhite: string
  colorPink: string
  colorBluelight: string

  // WT areas
  colorWT1Fill: string
  colorWT2Fill: string
  vwapColor: string

  // RSI colors
  rsiOverbought: string
  rsiOversold: string
  rsiInBetween: string

  // MFI colors
  mfiAbove: string
  mfiBelow: string

  // Divergence colors
  wtBearDiv: string
  wtBullDiv: string

  // Stoch colors
  stochK: string
  stochD: string

  // Sommi markers
  sommiBear: string
  sommiBull: string

  // MACD WT colors (match Pine constants)
  colormacdWT1a: string
  colormacdWT1b: string
  colormacdWT1c: string
  colormacdWT1d: string
  colormacdWT2a: string
  colormacdWT2b: string
  colormacdWT2c: string
  colormacdWT2d: string
}

// Main MarketVision Configuration (Pine v4 parity: VuManChu B Divergences)
export interface MarketVisionBConfig {
  waveTrend: VmcWaveTrendSettings
  mfi: VmcMfiSettings
  rsi: VmcRsiSettings
  stoch: VmcStochSettings
  schaff: VmcSchaffSettings
  sommi: VmcSommiSettings
  macdColors: VmcMacdColorsSettings
  divergenceEngine: VmcDivergenceEngineSettings
  mode: VmcModeSettings
  colors: VmcColorSettings
}

export interface MarketVisionSeriesLevels {
  zero: SeriesDataPoint[]
  obLevel2: SeriesDataPoint[]
  obLevel3: SeriesDataPoint[]
  osLevel2: SeriesDataPoint[]
}

export interface MarketVisionSignalSeries {
  // WT waves
  wt1: ColoredSeriesDataPoint[]
  wt2: ColoredSeriesDataPoint[]
  wtVwap: ColoredSeriesDataPoint[]

  // MFI area + bar
  rsiMfi: ColoredSeriesDataPoint[]
  mfiBarTop: ColoredSeriesDataPoint[]
  mfiBarBottom: ColoredSeriesDataPoint[]

  // RSI
  rsi: ColoredSeriesDataPoint[]

  // Stoch RSI
  stochK: ColoredSeriesDataPoint[]
  stochD: ColoredSeriesDataPoint[]

  // Schaff
  tc: ColoredSeriesDataPoint[]

  // Sommi higher VWAP (ema(hvwap, 3))
  sommiHvwap: ColoredSeriesDataPoint[]

  // Divergence points (pivot bar, i.e. offset=-2 semantics already applied)
  wtBearDiv: ColoredSeriesDataPoint[]
  wtBullDiv: ColoredSeriesDataPoint[]
  wtBearDiv2: ColoredSeriesDataPoint[]
  wtBullDiv2: ColoredSeriesDataPoint[]
  rsiBearDiv: ColoredSeriesDataPoint[]
  rsiBullDiv: ColoredSeriesDataPoint[]
  stochBearDiv: ColoredSeriesDataPoint[]
  stochBullDiv: ColoredSeriesDataPoint[]

  // Circles / dots / markers (absolute y-levels, Pine style)
  wtCrossCircles: ColoredSeriesDataPoint[]
  buyCircle: ColoredSeriesDataPoint[]
  sellCircle: ColoredSeriesDataPoint[]
  divBuyCircle: ColoredSeriesDataPoint[]
  divSellCircle: ColoredSeriesDataPoint[]
  goldBuyCircle: ColoredSeriesDataPoint[]
  sommiBearFlag: ColoredSeriesDataPoint[]
  sommiBullFlag: ColoredSeriesDataPoint[]
  sommiBearDiamond: ColoredSeriesDataPoint[]
  sommiBullDiamond: ColoredSeriesDataPoint[]
}

/** A discrete signal occurrence — mirrors the Pine script's alertcondition()s. */
export interface MarketVisionEventPoint {
  time: number
  index: number
}

export interface MarketVisionEvents {
  /** Big green circle: WT cross up while oversold ("Buy (Big green circle)"). */
  buy: MarketVisionEventPoint[]
  /** Big red circle: WT cross down while overbought ("Sell (Big red circle)"). */
  sell: MarketVisionEventPoint[]
  /** Divergence buy dot ("Buy (Big green circle + Div)"), at the confirmation bar. */
  buyDiv: MarketVisionEventPoint[]
  /** Divergence sell dot ("Sell (Big red circle + Div)"), at the confirmation bar. */
  sellDiv: MarketVisionEventPoint[]
  /** Gold circle ("GOLD Buy"), at the confirmation bar. */
  goldBuy: MarketVisionEventPoint[]
  /** Any WT cross up ("Buy (Small green dot)"). */
  smallBuyDot: MarketVisionEventPoint[]
  /** Any WT cross down ("Sell (Small red dot)"). */
  smallSellDot: MarketVisionEventPoint[]
  sommiBullFlag: MarketVisionEventPoint[]
  sommiBearFlag: MarketVisionEventPoint[]
  sommiBullDiamond: MarketVisionEventPoint[]
  sommiBearDiamond: MarketVisionEventPoint[]
}

/** Tolerance-paired divergence with resolved times (drawable as a line segment). */
export interface MarketVisionPairedDivergence {
  type: DivergenceType
  startIndex: number
  endIndex: number
  startTime: number
  endTime: number
  oscStart: number
  oscEnd: number
  priceStart: number
  priceEnd: number
}

export interface MarketVisionDivergences {
  wt: MarketVisionPairedDivergence[]
  rsi: MarketVisionPairedDivergence[]
  stoch: MarketVisionPairedDivergence[]
}

// Results Interface (Pine v4 series payload)
export interface MarketVisionBResult {
  series: MarketVisionSignalSeries
  levels: MarketVisionSeriesLevels
  /** Discrete signal events (Pine alertcondition parity). Additive — safe to ignore. */
  events: MarketVisionEvents
  /** Tolerance-paired divergences (upgraded engine). Additive — safe to ignore. */
  divergences: MarketVisionDivergences
}

// Default Configuration
export const DEFAULT_MARKET_VISION_CONFIG: MarketVisionBConfig = {
  waveTrend: {
    wtShow: true,
    wtBuyShow: true,
    wtGoldShow: true,
    wtSellShow: true,
    wtDivShow: true,
    vwapShow: true,
    wtChannelLen: 9,
    wtAverageLen: 12,
    wtMASource: 'hlc3',
    wtMALen: 3,
    obLevel: 53,
    obLevel2: 60,
    obLevel3: 100,
    osLevel: -53,
    osLevel2: -60,
    osLevel3: -75,
    wtShowDiv: true,
    wtShowHiddenDiv: false,
    showHiddenDiv_nl: true,
    wtDivOBLevel: 45,
    wtDivOSLevel: -65,
    wtDivOBLevel_addshow: true,
    wtDivOBLevel_add: 15,
    wtDivOSLevel_add: -40,
  },
  mfi: {
    rsiMFIShow: true,
    rsiMFIperiod: 60,
    rsiMFIMultiplier: 150,
    rsiMFIPosY: 2.5,
  },
  rsi: {
    rsiShow: true,
    rsiSRC: 'close',
    rsiLen: 14,
    rsiOversold: 30,
    rsiOverbought: 60,
    rsiShowDiv: false,
    rsiShowHiddenDiv: false,
    rsiDivOBLevel: 60,
    rsiDivOSLevel: 30,
  },
  stoch: {
    stochShow: true,
    stochUseLog: true,
    stochAvg: false,
    stochSRC: 'close',
    stochLen: 14,
    stochRsiLen: 14,
    stochKSmooth: 3,
    stochDSmooth: 3,
    stochShowDiv: false,
    stochShowHiddenDiv: false,
  },
  schaff: {
    tcLine: false,
    tcSRC: 'close',
    tclength: 10,
    tcfastLength: 23,
    tcslowLength: 50,
    tcfactor: 0.5,
  },
  sommi: {
    flag: {
      sommiFlagShow: false,
      sommiShowVwap: false,
      sommiVwapTF: '720',
      sommiVwapBearLevel: 0,
      sommiVwapBullLevel: 0,
      soomiFlagWTBearLevel: 0,
      soomiFlagWTBullLevel: 0,
      soomiRSIMFIBearLevel: 0,
      soomiRSIMFIBullLevel: 0,
    },
    diamond: {
      sommiDiamondShow: false,
      sommiHTCRes: '60',
      sommiHTCRes2: '240',
      soomiDiamondWTBearLevel: 0,
      soomiDiamondWTBullLevel: 0,
    },
  },
  macdColors: {
    macdWTColorsShow: false,
    macdWTColorsTF: '240',
  },
  divergenceEngine: {
    enabled: true,
    leftBars: 5,
    rightBars: 5,
    pairMode: 'TV-like',
    tolBars: 2,
    allowEqual: true,
    priceEps: 0,
    oscEps: 0,
  },
  mode: {
    darkMode: false,
  },
  colors: {
    colorRed: 'oklch(0.628 0.2577 29.23)',
    colorPurple: 'oklch(0.649 0.2983 328.36)',
    colorGreen: 'oklch(0.8722 0.287 141.02)',
    colorOrange: 'oklch(0.7576 0.1564 81.3)',
    colorYellow: 'oklch(0.9147 0.1908 101.03)',
    colorWhite: 'oklch(1 0 0)',
    colorPink: 'oklch(0.6931 0.3133 331.66)',
    colorBluelight: 'oklch(0.7623 0.1457 233.27)',

    // Pine defaults: oklch(0.66 0.1513 254.09) (WT1) / oklch(0.2608 0.1153 281.53) (WT2). Transparency is applied at render-time.
    colorWT1Fill: 'oklch(0.66 0.1513 254.09)',
    colorWT2Fill: 'oklch(0.2608 0.1153 281.53)',
    vwapColor: 'oklch(1 0 0 / 0.5)',

    rsiOverbought: 'oklch(0.6069 0.2 25.46)',
    rsiOversold: 'oklch(0.7978 0.2362 143.47)',
    rsiInBetween: 'oklch(0.6217 0.2474 319.5)',

    mfiAbove: 'oklch(0.7978 0.2362 143.47)',
    mfiBelow: 'oklch(0.6556 0.231 29.33)',

    wtBearDiv: 'oklch(0.5808 0.2383 29.23)',
    wtBullDiv: 'oklch(0.8099 0.2141 151.77)',

    stochK: 'oklch(0.7404 0.142 230.37 / 0.3)',
    stochD: 'oklch(0.4742 0.1862 294.78 / 0.1)',

    sommiBear: 'oklch(0.6931 0.3133 331.66)',
    sommiBull: 'oklch(0.7623 0.1457 233.27)',

    colormacdWT1a: 'oklch(0.6743 0.1551 145.92)',
    colormacdWT1b: 'oklch(0.5446 0.1301 22.36)',
    colormacdWT1c: 'oklch(0.8353 0.1698 143.87)',
    colormacdWT1d: 'oklch(0.6504 0.2355 26.83)',
    colormacdWT2a: 'oklch(0.4139 0.0757 144.06)',
    colormacdWT2b: 'oklch(0.1987 0.0787 28.47)',
    colormacdWT2c: 'oklch(0.2332 0.035 144.35)',
    colormacdWT2d: 'oklch(0.3575 0.1467 29.23)',
  },
}

// Export as both the default and as marketVisionConfig for backward compatibility
export const marketVisionConfig = DEFAULT_MARKET_VISION_CONFIG