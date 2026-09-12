import Foundation

/// Port of `market-vision-compute.ts` (`computeMarketVisionB`).
public enum MarketVision {
  static func withAlpha(_ c: String, _ a: Double) -> String { OklchColor.withAlpha(c, max(0, min(1, a))) }

  static func colored(_ times: [Int], _ values: [Double], _ color: ((Int, Double) -> String?)? = nil) -> [ColoredPoint] {
    var out: [ColoredPoint] = []
    for i in 0..<min(times.count, values.count) where values[i].isFinite {
      out.append(ColoredPoint(time: times[i], value: values[i], color: color?(i, values[i])))
    }
    return out
  }

  static func constant(_ times: [Int], _ value: Double, _ color: ((Int) -> String?)? = nil) -> [ColoredPoint] {
    times.enumerated().map { ColoredPoint(time: $0.element, value: value, color: color?($0.offset)) }
  }

  static func markers(_ times: [Int], _ signal: [Bool], _ value: Double, _ color: (Int) -> String, offset: Int) -> [ColoredPoint] {
    var out: [ColoredPoint] = []
    for i in 0..<min(times.count, signal.count) where signal[i] {
      let j = i + offset
      guard j >= 0, j < times.count else { continue }
      out.append(ColoredPoint(time: times[j], value: value, color: color(i)))
    }
    return out
  }

  static func pivotValues(_ times: [Int], _ signal: [Bool], _ values: [Double], _ color: (Int) -> String, offset: Int) -> [ColoredPoint] {
    var out: [ColoredPoint] = []
    let n = min(times.count, signal.count, values.count)
    for i in 0..<n where signal[i] {
      let j = i + offset
      guard j >= 0, j < n, values[j].isFinite else { continue }
      out.append(ColoredPoint(time: times[j], value: values[j], color: color(i)))
    }
    return out
  }

  static func events(_ times: [Int], _ signal: [Bool]) -> [MarketVisionEvent] {
    var out: [MarketVisionEvent] = []
    for i in 0..<min(times.count, signal.count) where signal[i] { out.append(MarketVisionEvent(time: times[i], index: i)) }
    return out
  }

  public static func compute(_ data: [OHLCVBar], config c: MarketVisionConfig = .default) -> MarketVisionResult {
    var result = MarketVisionResult()
    guard !data.isEmpty else { return result }
    let n = data.count
    let times = data.map(\.time)
    let sources = CandleSources(data)

    let wave = VmcCore.waveTrend(sources, source: c.waveTrend.wtMASource, channelLen: c.waveTrend.wtChannelLen, averageLen: c.waveTrend.wtAverageLen, maLen: c.waveTrend.wtMALen)
    let wt1 = wave.wt1, wt2 = wave.wt2
    let rsiValues = PineMath.rsi(sources.series(c.rsi.source), c.rsi.length)
    let rsimfi = VmcCore.rsiMfi(data, period: c.mfi.period, multiplier: c.mfi.multiplier, posY: c.mfi.posY)
    let stoch = VmcCore.stochRsi(sources.series(c.stoch.source), stochLen: c.stoch.length, rsiLen: c.stoch.rsiLength, kSmooth: c.stoch.kSmooth, dSmooth: c.stoch.dSmooth, useLog: c.stoch.useLog, useAvg: c.stoch.avg)
    let tcValues = c.schaff.tcLine ? VmcCore.schaffTc(sources.series(c.schaff.source), length: c.schaff.length, fastLength: c.schaff.fastLength, slowLength: c.schaff.slowLength, factor: c.schaff.factor) : [Double](repeating: .nan, count: n)

    let wtDivs = VmcDivergences.find(src: wt2, priceHigh: sources.high, priceLow: sources.low, topLimit: c.waveTrend.wtDivOBLevel, botLimit: c.waveTrend.wtDivOSLevel, useLimits: true)
    let wtDivs2 = VmcDivergences.find(src: wt2, priceHigh: sources.high, priceLow: sources.low, topLimit: c.waveTrend.wtDivOBLevelAdd, botLimit: c.waveTrend.wtDivOSLevelAdd, useLimits: true)
    let wtDivsNl = VmcDivergences.find(src: wt2, priceHigh: sources.high, priceLow: sources.low, topLimit: 0, botLimit: 0, useLimits: false)
    let useNl = c.waveTrend.showHiddenDivNl
    let wtBearHiddenSel = useNl ? wtDivsNl.bearHidden : wtDivs.bearHidden
    let wtBullHiddenSel = useNl ? wtDivsNl.bullHidden : wtDivs.bullHidden
    let rsiDivs = VmcDivergences.find(src: rsiValues, priceHigh: sources.high, priceLow: sources.low, topLimit: c.rsi.divOBLevel, botLimit: c.rsi.divOSLevel, useLimits: true)
    let rsiDivsNl = VmcDivergences.find(src: rsiValues, priceHigh: sources.high, priceLow: sources.low, topLimit: 0, botLimit: 0, useLimits: false)
    let rsiBearHiddenSel = useNl ? rsiDivsNl.bearHidden : rsiDivs.bearHidden
    let rsiBullHiddenSel = useNl ? rsiDivsNl.bullHidden : rsiDivs.bullHidden
    let stochDivs = VmcDivergences.find(src: stoch.k, priceHigh: sources.high, priceLow: sources.low, topLimit: 0, botLimit: 0, useLimits: false)

    let wtOversold = wt2.map { $0.isFinite && $0 <= c.waveTrend.osLevel }
    let wtOverbought = wt2.map { $0.isFinite && $0 >= c.waveTrend.obLevel }
    var buySignal = [Bool](repeating: false, count: n), sellSignal = buySignal, smallBuy = buySignal, smallSell = buySignal
    for i in 0..<n {
      smallBuy[i] = wave.wtCross[i] && wave.wtCrossUp[i]
      smallSell[i] = wave.wtCross[i] && wave.wtCrossDown[i]
      buySignal[i] = smallBuy[i] && wtOversold[i]
      sellSignal[i] = smallSell[i] && wtOverbought[i]
    }
    var buyDiv = [Bool](repeating: false, count: n), sellDiv = buyDiv
    for i in 0..<n {
      buyDiv[i] = (c.waveTrend.wtShowDiv && wtDivs.bullDiv[i]) || (c.waveTrend.wtShowDiv && c.waveTrend.wtDivOBLevelAddShow && wtDivs2.bullDiv[i]) || (c.stoch.showDiv && stochDivs.bullDiv[i]) || (c.rsi.showDiv && rsiDivs.bullDiv[i])
      sellDiv[i] = (c.waveTrend.wtShowDiv && wtDivs.bearDiv[i]) || (c.waveTrend.wtShowDiv && c.waveTrend.wtDivOBLevelAddShow && wtDivs2.bearDiv[i]) || (c.stoch.showDiv && stochDivs.bearDiv[i]) || (c.rsi.showDiv && rsiDivs.bearDiv[i])
    }
    let divBuyColor: (Int) -> String = { i in
      if wtDivs.bullDiv[i] { return c.colors.colorGreen }
      if c.waveTrend.wtDivOBLevelAddShow && wtDivs2.bullDiv[i] { return withAlpha(c.colors.colorGreen, 0.4) }
      return c.colors.colorGreen
    }
    let divSellColor: (Int) -> String = { i in
      if wtDivs.bearDiv[i] { return c.colors.colorRed }
      if c.waveTrend.wtDivOBLevelAddShow && wtDivs2.bearDiv[i] { return withAlpha(c.colors.colorRed, 0.4) }
      return c.colors.colorRed
    }

    var goldBuy = [Bool](repeating: false, count: n)
    for i in 0..<n {
      let prevIx = wtDivs.prevBotPivotIndex[i]
      let lastRsi = prevIx.map { rsiValues[$0] } ?? .nan
      let wtLowPrev = wtDivs.prevBotSrc[i], wt2Now = wt2[i]
      goldBuy[i] = ((c.waveTrend.wtShowDiv && wtDivs.bullDiv[i]) || (c.rsi.showDiv && rsiDivs.bullDiv[i]))
        && wtLowPrev.isFinite && wt2Now.isFinite && wtLowPrev <= c.waveTrend.osLevel3 && wt2Now > c.waveTrend.osLevel3
        && wtLowPrev - wt2Now <= -5 && lastRsi.isFinite && lastRsi < 30
    }

    // Higher-timeframe features
    var sommiHvwapAligned = [Double](repeating: .nan, count: n)
    var flagBear = [Bool](repeating: false, count: n), flagBull = flagBear, diamondBear = flagBear, diamondBull = flagBear
    var macdWT1Color = [String?](repeating: nil, count: n), macdWT2Color = macdWT1Color

    if c.sommiFlag.show || c.sommiFlag.showVwap, let tfMin = Timeframes.parsePineTimeframeMinutes(c.sommiFlag.vwapTF), Timeframes.canResampleToMinutes(data, tfMin) {
      let target = tfMin * 60
      let resampled = Timeframes.resample(data, toSeconds: target)
      let map = Timeframes.baseToResampledIndexMap(base: data, resampled: resampled, targetSeconds: target)
      let hWave = VmcCore.waveTrend(CandleSources(resampled), source: c.waveTrend.wtMASource, channelLen: c.waveTrend.wtChannelLen, averageLen: c.waveTrend.wtAverageLen, maLen: c.waveTrend.wtMALen)
      let aligned = Timeframes.alignHtfValuesToBase(map, hWave.wtVwap, lookahead: .off)
      sommiHvwapAligned = aligned
      if c.sommiFlag.show {
        let s = VmcPatterns.sommiFlag(rsimfi: rsimfi, wt2: wt2, wtCross: wave.wtCross, wtCrossUp: wave.wtCrossUp, wtCrossDown: wave.wtCrossDown, hwtVwap: aligned,
                                       rsiMfiBear: c.sommiFlag.rsiMfiBearLevel, rsiMfiBull: c.sommiFlag.rsiMfiBullLevel, wtBear: c.sommiFlag.wtBearLevel, wtBull: c.sommiFlag.wtBullLevel,
                                       vwapBear: c.sommiFlag.vwapBearLevel, vwapBull: c.sommiFlag.vwapBullLevel)
        for i in 0..<n { flagBear[i] = i < s.bearish.count && s.bearish[i]; flagBull[i] = i < s.bullish.count && s.bullish[i] }
      }
    }
    if c.sommiDiamond.show, let tf1 = Timeframes.parsePineTimeframeMinutes(c.sommiDiamond.htcRes), let tf2 = Timeframes.parsePineTimeframeMinutes(c.sommiDiamond.htcRes2),
       Timeframes.canResampleToMinutes(data, tf1), Timeframes.canResampleToMinutes(data, tf2) {
      let ha1 = Timeframes.toHeikinAshi(Timeframes.resample(data, toSeconds: tf1 * 60))
      let ha2 = Timeframes.toHeikinAshi(Timeframes.resample(data, toSeconds: tf2 * 60))
      let m1 = Timeframes.baseToResampledIndexMap(base: data, resampled: ha1, targetSeconds: tf1 * 60)
      let m2 = Timeframes.baseToResampledIndexMap(base: data, resampled: ha2, targetSeconds: tf2 * 60)
      let dir1 = m1.map { $0.map { ha1[$0].close > ha1[$0].open } ?? false }
      let dir2 = m2.map { $0.map { ha2[$0].close > ha2[$0].open } ?? false }
      let d = VmcPatterns.sommiDiamond(wt2: wt2, wtCross: wave.wtCross, wtCrossUp: wave.wtCrossUp, wtCrossDown: wave.wtCrossDown, dir1: dir1, dir2: dir2, bearLevel: c.sommiDiamond.wtBearLevel, bullLevel: c.sommiDiamond.wtBullLevel)
      for i in 0..<n { diamondBear[i] = d.bearish[i]; diamondBull[i] = d.bullish[i] }
    }
    if c.macdColors.show, let tfMin = Timeframes.parsePineTimeframeMinutes(c.macdColors.tf), Timeframes.canResampleToMinutes(data, tfMin) {
      let target = tfMin * 60
      let resampled = Timeframes.resample(data, toSeconds: target)
      let map = Timeframes.baseToResampledIndexMap(base: data, resampled: resampled, targetSeconds: target)
      let hrsimfi = Timeframes.alignHtfValuesToBase(map, VmcCore.rsiMfi(resampled, period: c.mfi.period, multiplier: c.mfi.multiplier, posY: c.mfi.posY), lookahead: .off)
      let macd = VmcCore.macd(resampled.map(\.close), fastLen: 28, slowLen: 42, sigSmooth: 9)
      let colors = VmcPatterns.macdWtColors(hrsimfi: hrsimfi, macd: Timeframes.alignHtfValuesToBase(map, macd.macd, lookahead: .off), signal: Timeframes.alignHtfValuesToBase(map, macd.signal, lookahead: .off),
                                             wt1a: c.colors.macdWT1a, wt1b: c.colors.macdWT1b, wt1c: c.colors.macdWT1c, wt1d: c.colors.macdWT1d,
                                             wt2a: c.colors.macdWT2a, wt2b: c.colors.macdWT2b, wt2c: c.colors.macdWT2c, wt2d: c.colors.macdWT2d)
      for i in 0..<n { macdWT1Color[i] = colors.wt1[i]; macdWT2Color[i] = colors.wt2[i] }
    }

    let rsiColor: (Int, Double) -> String? = { _, v in v <= c.rsi.oversold ? c.colors.rsiOversold : (v >= c.rsi.overbought ? c.colors.rsiOverbought : c.colors.rsiInBetween) }
    let mfiColor: (Int, Double) -> String? = { _, v in v > 0 ? c.colors.mfiAbove : c.colors.mfiBelow }
    let wtCrossColor: (Int) -> String = { i in
      guard wt1[i].isFinite, wt2[i].isFinite else { return c.colors.colorWhite }
      return wt2[i] - wt1[i] > 0 ? "oklch(0.6786 0.2095 24.66 / 0.85)" : "oklch(0.8099 0.2141 151.77 / 0.85)"
    }

    var s = MarketVisionSeries()
    if c.waveTrend.wtShow {
      s.wt1 = colored(times, wt1) { i, _ in macdWT1Color[i] ?? c.colors.colorWT1Fill }
      s.wt2 = colored(times, wt2) { i, _ in macdWT2Color[i] ?? c.colors.colorWT2Fill }
    }
    if c.waveTrend.vwapShow { s.wtVwap = colored(times, wave.wtVwap) { _, _ in c.colors.vwapColor } }
    if c.mfi.rsiMFIShow {
      s.rsiMfi = colored(times, rsimfi, mfiColor)
      s.mfiBarTop = constant(times, -95) { i in mfiColor(i, rsimfi[i].isFinite ? rsimfi[i] : 0) }
      s.mfiBarBottom = constant(times, -99) { i in mfiColor(i, rsimfi[i].isFinite ? rsimfi[i] : 0) }
    }
    if c.rsi.rsiShow { s.rsi = colored(times, rsiValues, rsiColor) }
    if c.stoch.show {
      s.stochK = colored(times, stoch.k) { _, _ in c.colors.stochK }
      s.stochD = colored(times, stoch.d) { _, _ in c.colors.stochD }
    }
    if c.schaff.tcLine { s.tc = colored(times, tcValues) { _, _ in "oklch(0.4742 0.1862 294.78 / 0.25)" } }
    if c.waveTrend.wtShowDiv || c.waveTrend.wtShowHiddenDiv {
      let bear = (0..<n).map { (c.waveTrend.wtShowDiv && wtDivs.bearDiv[$0]) || (c.waveTrend.wtShowHiddenDiv && wtBearHiddenSel[$0]) }
      let bull = (0..<n).map { (c.waveTrend.wtShowDiv && wtDivs.bullDiv[$0]) || (c.waveTrend.wtShowHiddenDiv && wtBullHiddenSel[$0]) }
      s.wtBearDiv = pivotValues(times, bear, wt2, { _ in c.colors.wtBearDiv }, offset: -2)
      s.wtBullDiv = pivotValues(times, bull, wt2, { _ in c.colors.wtBullDiv }, offset: -2)
    }
    if c.waveTrend.wtShowDiv && c.waveTrend.wtDivOBLevelAddShow {
      s.wtBearDiv2 = pivotValues(times, wtDivs2.bearDiv, wt2, { _ in c.colors.wtBearDiv }, offset: -2)
      s.wtBullDiv2 = pivotValues(times, wtDivs2.bullDiv, wt2, { _ in c.colors.wtBullDiv }, offset: -2)
    }
    if c.rsi.showDiv || c.rsi.showHiddenDiv {
      let bear = (0..<n).map { (c.rsi.showDiv && rsiDivs.bearDiv[$0]) || (c.rsi.showHiddenDiv && rsiBearHiddenSel[$0]) }
      let bull = (0..<n).map { (c.rsi.showDiv && rsiDivs.bullDiv[$0]) || (c.rsi.showHiddenDiv && rsiBullHiddenSel[$0]) }
      s.rsiBearDiv = pivotValues(times, bear, rsiValues, { _ in c.colors.wtBearDiv }, offset: -2)
      s.rsiBullDiv = pivotValues(times, bull, rsiValues, { _ in c.colors.wtBullDiv }, offset: -2)
    }
    if c.stoch.showDiv || c.stoch.showHiddenDiv {
      let bear = (0..<n).map { (c.stoch.showDiv && stochDivs.bearDiv[$0]) || (c.stoch.showHiddenDiv && stochDivs.bearHidden[$0]) }
      let bull = (0..<n).map { (c.stoch.showDiv && stochDivs.bullDiv[$0]) || (c.stoch.showHiddenDiv && stochDivs.bullHidden[$0]) }
      s.stochBearDiv = pivotValues(times, bear, stoch.k, { _ in c.colors.colorRed }, offset: -2)
      s.stochBullDiv = pivotValues(times, bull, stoch.k, { _ in c.colors.colorGreen }, offset: -2)
    }
    s.wtCrossCircles = colored(times, (0..<n).map { wave.wtCross[$0] ? wt2[$0] : .nan }) { i, _ in wtCrossColor(i) }
    if c.waveTrend.wtBuyShow { s.buyCircle = markers(times, buySignal, -107, { _ in c.colors.colorGreen }, offset: 0) }
    if c.waveTrend.wtSellShow { s.sellCircle = markers(times, sellSignal, 105, { _ in c.colors.colorRed }, offset: 0) }
    if c.waveTrend.wtDivShow {
      s.divBuyCircle = markers(times, buyDiv, -106, divBuyColor, offset: -2)
      s.divSellCircle = markers(times, sellDiv, 106, divSellColor, offset: -2)
    }
    if c.waveTrend.wtGoldShow { s.goldBuyCircle = markers(times, goldBuy, -106, { _ in c.colors.colorOrange }, offset: -2) }
    if c.sommiFlag.showVwap { s.sommiHvwap = colored(times, PineMath.ema(sommiHvwapAligned, 3)) { _, _ in c.colors.colorYellow } }
    if c.sommiFlag.show {
      s.sommiBearFlag = markers(times, flagBear, 108, { _ in c.colors.sommiBear }, offset: 0)
      s.sommiBullFlag = markers(times, flagBull, -108, { _ in c.colors.sommiBull }, offset: 0)
    }
    if c.sommiDiamond.show {
      s.sommiBearDiamond = markers(times, diamondBear, 108, { _ in c.colors.sommiBear }, offset: 0)
      s.sommiBullDiamond = markers(times, diamondBull, -108, { _ in c.colors.sommiBull }, offset: 0)
    }
    result.series = s
    result.zeroLevel = constant(times, 0)
    result.ob2Level = constant(times, c.waveTrend.obLevel2)
    result.ob3Level = constant(times, c.waveTrend.obLevel3)
    result.os2Level = constant(times, c.waveTrend.osLevel2)

    var ev = MarketVisionEvents()
    ev.buy = events(times, buySignal); ev.sell = events(times, sellSignal)
    ev.buyDiv = events(times, buyDiv); ev.sellDiv = events(times, sellDiv); ev.goldBuy = events(times, goldBuy)
    ev.smallBuyDot = events(times, smallBuy); ev.smallSellDot = events(times, smallSell)
    ev.sommiBullFlag = events(times, flagBull); ev.sommiBearFlag = events(times, flagBear)
    ev.sommiBullDiamond = events(times, diamondBull); ev.sommiBearDiamond = events(times, diamondBear)
    result.events = ev

    if c.engine.enabled {
      let cfg = DivergenceEngineConfig(leftBars: c.engine.leftBars, rightBars: c.engine.rightBars, pairMode: c.engine.pairMode, tolBars: c.engine.tolBars, allowEqual: c.engine.allowEqual, priceEps: c.engine.priceEps, oscEps: c.engine.oscEps, showRegular: true, showHidden: true)
      func timed(_ d: PairedDivergence) -> TimedDivergence {
        TimedDivergence(type: d.type, startIndex: d.startIndex, endIndex: d.endIndex, startTime: times[d.startIndex], endTime: times[d.endIndex], oscStart: d.oscStart, oscEnd: d.oscEnd, priceStart: d.priceStart, priceEnd: d.priceEnd)
      }
      result.wtDivergences = DivergenceEngine.findPairedDivergences(highs: sources.high, lows: sources.low, osc: wt2, config: cfg).map(timed)
      result.rsiDivergences = DivergenceEngine.findPairedDivergences(highs: sources.high, lows: sources.low, osc: rsiValues, config: cfg).map(timed)
      result.stochDivergences = DivergenceEngine.findPairedDivergences(highs: sources.high, lows: sources.low, osc: stoch.k, config: cfg).map(timed)
    }
    return result
  }
}
