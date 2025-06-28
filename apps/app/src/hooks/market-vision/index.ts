'use client'

import { useMemo } from 'react'
import type { 
  OHLCVDataPoint, 
  SeriesDataPoint, 
  MarketVisionBConfig,
  MarketVisionBResult
} from './market-vision-config'
import { calculateOscillators } from './oscillators'
import { calculateWaveTrend } from './wave-trend'
import { calculateMoneyFlow } from './money-flow'
import { calculateStochastic } from './stochastic'

// Default configuration matching Pine Script
const DEFAULT_CONFIG: MarketVisionBConfig = {
  // Oscillator 1 Settings (RSI, MFI, Ultimate, Williams %R, Double RSI)
  oscillator1: {
    show: true,
    type: 'RSI',
    length: 14,
    source: 'close',
    overbought: 70,
    oversold: 30,
    color: '#D4F321'
  },
  
  // Oscillator 2 Settings
  oscillator2: {
    show: false,
    type: 'MFI',
    length: 14,
    source: 'hlc3',
    overbought: 80,
    oversold: 20,
    color: '#FF6B6B'
  },
  
  // Wave Trend Settings
  waveTrend: {
    show: true,
    source: 'hlc3',
    channelLength: 9,
    averageLength: 12,
    overbought: 60,
    oversold: -60,
    veryOverbought: 53,
    veryOversold: -53,
    showZeroCrossing: true,
    showOBOSDuplication: true,
    showDelta: true,
    deltaOutlineOnly: false,
    color1: '#00FFEB',
    color2: '#0041FF',
    outlineColor: '#FFFFFF',
    brightness: 100
  },
  
  // Money Flow Settings
  moneyFlow: {
    show: true,
    type: 'MFI',
    multiplier: 150,
    maLength: 14,
    oscLength: 14,
    fillArea: false,
    brightness: 100,
    yOffset: 2.5,
    showFast: true,
    showSlow: false,
    fastColor: '#00FF08',
    slowColor: '#FF0000'
  },
  
  // Stochastic Settings
  stochastic: {
    show: true,
    type: 'Stochastic - Standard',
    source: 'Price',
    showType: 'K and D',
    kPeriod: 14,
    dPeriod: 3,
    smoothing: 3,
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
    brightness: 100,
    kColor: '#F700FF',
    dColor: '#2195F3'
  },
  
  // Display Settings
  display: {
    showLevels: true,
    showBackground: true,
    showLabels: true,
    transparency: 80
  }
}

export function useMarketVisionB(
  data: OHLCVDataPoint[],
  config?: Partial<MarketVisionBConfig>
): MarketVisionBResult {
  return useMemo(() => {
    const finalConfig = { ...DEFAULT_CONFIG, ...config }
    
    if (!data || data.length === 0) {
      return {
        oscillator1: [],
        oscillator2: [],
        waveTrend: {
          wt1: [],
          wt2: [],
          delta: [],
          positiveCrosses: [],
          negativeCrosses: [],
          zeroCrosses: [],
          obPositiveCrosses: [],
          obNegativeCrosses: [],
          osPositiveCrosses: [],
          osNegativeCrosses: [],
          trendFilter: { positive: [], negative: [] },
          colors: {
            wt1Outline: '',
            wt1Area: '',
            wt2Area: '',
            deltaArea: '',
            fillArea: ''
          }
        },
        moneyFlow: {
          fast: [],
          slow: [],
          direction: [],
          moneyFlowValue: []
        },
        levels: {
          zero: [],
          overbought1: [],
          oversold1: [],
          overbought2: [],
          oversold2: []
        }
      }
    }
    
    // Calculate all components
    const oscillators = calculateOscillators(data, {
      oscillator1: finalConfig.oscillator1,
      oscillator2: finalConfig.oscillator2
    })
    
    const waveTrend = calculateWaveTrend(data, {
      show: finalConfig.waveTrend.show,
      source: 'hlc3',
      channelLength: finalConfig.waveTrend.channelLength,
      averageLength: finalConfig.waveTrend.averageLength,
      overbought: finalConfig.waveTrend.overbought,
      oversold: finalConfig.waveTrend.oversold,
      veryOverbought: finalConfig.waveTrend.veryOverbought,
      veryOversold: finalConfig.waveTrend.veryOversold,
      showZeroCrossing: true,
      showOBOSDuplication: true,
      showDelta: true,
      deltaOutlineOnly: false
    })
    
    const moneyFlow = calculateMoneyFlow(data, finalConfig.moneyFlow)
    
    const stochastic = calculateStochastic(
      data.map(d => d.close),
      data.map(d => d.high), 
      data.map(d => d.low),
      finalConfig.stochastic.kPeriod,
      finalConfig.stochastic.dSmoothing,
      finalConfig.stochastic.kSmoothing
    )
    
    // Generate levels
    const times = data.map(d => d.time)
    const levels = {
      overbought1: times.map(time => ({ time, value: finalConfig.waveTrend.overbought })),
      overbought2: times.map(time => ({ time, value: finalConfig.waveTrend.veryOverbought })),
      oversold1: times.map(time => ({ time, value: finalConfig.waveTrend.oversold })),
      oversold2: times.map(time => ({ time, value: finalConfig.waveTrend.veryOversold })),
      zero: times.map(time => ({ time, value: 0 }))
    }
    
    return {
      oscillator1: oscillators.oscillator1,
      oscillator2: oscillators.oscillator2,
      waveTrend: {
        wt1: waveTrend.wt1,
        wt2: waveTrend.wt2,
        delta: waveTrend.delta,
        positiveCrosses: waveTrend.positiveCrosses,
        negativeCrosses: waveTrend.negativeCrosses,
        zeroCrosses: waveTrend.zeroCrosses,
        obPositiveCrosses: waveTrend.obPositiveCrosses,
        obNegativeCrosses: waveTrend.obNegativeCrosses,
        osPositiveCrosses: waveTrend.osPositiveCrosses,
        osNegativeCrosses: waveTrend.osNegativeCrosses,
        trendFilter: waveTrend.trendFilter,
        colors: waveTrend.colors
      },
      moneyFlow: {
        fast: moneyFlow.values,
        slow: [],
        direction: moneyFlow.direction,
        moneyFlowValue: moneyFlow.moneyFlowValue
      },
      stochastic: {
        k: stochastic.k.map((val, i) => ({ time: data[i]?.time, value: val })).filter((item): item is SeriesDataPoint => item.time != null),
        d: stochastic.d.map((val, i) => ({ time: data[i]?.time, value: val })).filter((item): item is SeriesDataPoint => item.time != null),
        obv: []
      },
      levels
    }
    
  }, [data, config])
}

export type { MarketVisionBConfig, MarketVisionBResult } from './market-vision-config'
export { DEFAULT_CONFIG as defaultMarketVisionBConfig }

// Export RSI divergence detection functionality
export { 
  getRSIDivergences, 
  getAllRSIDivergences, 
  type DivergencePoint,
  calculateStochasticIndicator,
  type StochasticConfig,
  type StochasticResult
} from './stochastic'

// Export Bollinger Bands functionality
export {
  calculateBollingerBands,
  type BollingerBandsConfig,
  type BollingerBandsResult,
  DEFAULT_BB_COLORS
} from './bollinger-bands'