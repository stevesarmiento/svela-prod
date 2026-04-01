'use client'

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

// Results Interface (Pine v4 series payload)
export interface MarketVisionBResult {
  series: MarketVisionSignalSeries
  levels: MarketVisionSeriesLevels
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
  mode: {
    darkMode: false,
  },
  colors: {
    colorRed: '#ff0000',
    colorPurple: '#e600e6',
    colorGreen: '#3fff00',
    colorOrange: '#e2a400',
    colorYellow: '#ffe500',
    colorWhite: '#ffffff',
    colorPink: '#ff00f0',
    colorBluelight: '#31c0ff',

    // Pine defaults: #4994ec (WT1) / #1f1559 (WT2). Transparency is applied at render-time.
    colorWT1Fill: '#4994ec',
    colorWT2Fill: '#1f1559',
    vwapColor: 'rgba(255, 255, 255, 0.50)',

    rsiOverbought: '#e13e3e',
    rsiOversold: '#3ee145',
    rsiInBetween: '#c33ee1',

    mfiAbove: '#3ee145',
    mfiBelow: '#ff3d2e',

    wtBearDiv: '#e60000',
    wtBullDiv: '#00e676',

    stochK: 'rgba(33, 186, 243, 0.30)',
    stochD: 'rgba(103, 58, 183, 0.10)',

    sommiBear: '#ff00f0',
    sommiBull: '#31c0ff',

    colormacdWT1a: '#4caf58',
    colormacdWT1b: '#af4c4c',
    colormacdWT1c: '#7ee57e',
    colormacdWT1d: '#ff3535',
    colormacdWT2a: '#305630',
    colormacdWT2b: '#310101',
    colormacdWT2c: '#132213',
    colormacdWT2d: '#770000',
  },
}

// Export as both the default and as marketVisionConfig for backward compatibility
export const marketVisionConfig = DEFAULT_MARKET_VISION_CONFIG

export const DEFAULT_MARKET_VISION_COLORS = DEFAULT_MARKET_VISION_CONFIG.colors