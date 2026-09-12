import Foundation
import Testing
@testable import AggrCore

// Ports of market-vision-compute.test.ts, rsi-divergences.test.ts, rsi-signal.test.ts, reverse-rsi.test.ts, vmc-divergences.test.ts, timeframes.test.ts
@Suite struct MarketVisionComputeTests {
  static let bars = IndicatorFixtures.bars(count: 400, seed: 42)

  @Test func emptyInput() {
    let r = MarketVision.compute([])
    #expect(r.series.wt1.isEmpty && r.zeroLevel.isEmpty && r.events.buy.isEmpty && r.wtDivergences.isEmpty)
  }

  @Test func seriesCountsCharacterization() {
    let s = MarketVision.compute(Self.bars).series
    #expect(s.wt1.count == 388); #expect(s.wt2.count == 386); #expect(s.wtVwap.count == 386)
    #expect(s.rsiMfi.count == 341); #expect(s.mfiBarTop.count == 400); #expect(s.mfiBarBottom.count == 400)
    #expect(s.rsi.count == 386); #expect(s.stochK.count == 398); #expect(s.stochD.count == 396)
    #expect(s.tc.isEmpty && s.sommiHvwap.isEmpty)
    #expect(s.wtBearDiv.count == 2); #expect(s.wtBullDiv.isEmpty); #expect(s.wtBearDiv2.count == 1); #expect(s.wtBullDiv2.isEmpty)
    #expect(s.rsiBearDiv.isEmpty && s.rsiBullDiv.isEmpty && s.stochBearDiv.isEmpty && s.stochBullDiv.isEmpty)
    #expect(s.wtCrossCircles.count == 38); #expect(s.buyCircle.count == 7); #expect(s.sellCircle.count == 8)
    #expect(s.divBuyCircle.isEmpty); #expect(s.divSellCircle.count == 2); #expect(s.goldBuyCircle.isEmpty)
  }

  @Test func wt2TailRegression() {
    let wt2 = MarketVision.compute(Self.bars).series.wt2.suffix(3)
    let expected: [(Int, Double)] = [(1701429200, 56.38823252), (1701432800, 66.17181991), (1701436400, 73.42121175)]
    for (p, e) in zip(wt2, expected) { #expect(p.time == e.0); #expect(abs(p.value - e.1) < 1e-7) }
  }

  @Test func eventsCharacterization() {
    let r = MarketVision.compute(Self.bars)
    #expect(r.events.buy.map(\.index) == [51, 123, 193, 259, 262, 287, 352])
    #expect(r.events.sell.map(\.index) == [76, 104, 145, 168, 236, 238, 308, 379])
    #expect(r.events.goldBuy.isEmpty)
    #expect(r.events.smallBuyDot.count == 19 && r.events.smallSellDot.count == 19)
    #expect(r.events.buyDiv.isEmpty && r.events.sellDiv.count == 2)
    let small = Set(r.events.smallBuyDot.map(\.index))
    for e in r.events.buy { #expect(small.contains(e.index)) }
    #expect(r.events.buy.map(\.time) == r.series.buyCircle.map(\.time))
    #expect(r.events.sell.map(\.time) == r.series.sellCircle.map(\.time))
  }

  @Test func eventsIgnoreDisplayFlags() {
    var c = MarketVisionConfig.default
    c.waveTrend.wtBuyShow = false; c.waveTrend.wtSellShow = false; c.waveTrend.wtGoldShow = false
    let r = MarketVision.compute(Self.bars, config: c)
    #expect(r.series.buyCircle.isEmpty)
    #expect(r.events.buy.count == 7 && r.events.sell.count == 8)
  }

  @Test func pairedDivergencesCharacterization() {
    let r = MarketVision.compute(Self.bars)
    #expect(r.wtDivergences.map { [$0.type.rawValue, String($0.startIndex), String($0.endIndex)] } == [["bullish", "93", "156"], ["h_bullish", "223", "262"], ["bearish", "212", "274"]])
    #expect(r.rsiDivergences.isEmpty)
    #expect(r.stochDivergences.map { [$0.type.rawValue, String($0.startIndex), String($0.endIndex)] } == [["h_bearish", "103", "210"], ["bullish", "156", "220"]])
    for d in r.wtDivergences { #expect(d.startTime == Self.bars[d.startIndex].time && d.endTime == Self.bars[d.endIndex].time && d.endIndex > d.startIndex) }
    var c = MarketVisionConfig.default; c.engine.enabled = false
    let off = MarketVision.compute(Self.bars, config: c)
    #expect(off.wtDivergences.isEmpty && off.events.buy.count == 7)
  }

  @Test func sommiHvwapLookaheadOff() {
    var c = MarketVisionConfig.default
    c.sommiFlag.showVwap = true; c.sommiFlag.show = true; c.sommiFlag.vwapTF = "240"
    let r = MarketVision.compute(Self.bars, config: c)
    let target = 240 * 60
    let resampled = Timeframes.resample(Self.bars, toSeconds: target)
    let map = Timeframes.baseToResampledIndexMap(base: Self.bars, resampled: resampled, targetSeconds: target)
    let hWave = VmcCore.waveTrend(CandleSources(resampled), source: .hlc3, channelLen: 9, averageLen: 12, maLen: 3)
    let expected = PineMath.ema(Timeframes.alignHtfValuesToBase(map, hWave.wtVwap, lookahead: .off), 3)
    let exp = zip(Self.bars, expected).filter { $0.1.isFinite }
    #expect(r.series.sommiHvwap.count == exp.count)
    for (p, e) in zip(r.series.sommiHvwap, exp) { #expect(p.time == e.0.time && abs(p.value - e.1) < 1e-9) }
    #expect(r.events.sommiBearFlag.map(\.index) == [212, 216])
    #expect(r.events.sommiBullFlag.isEmpty)
  }

  @Test func macdWtColorsLookaheadOff() {
    var c = MarketVisionConfig.default
    c.macdColors.show = true; c.macdColors.tf = "240"
    let r = MarketVision.compute(Self.bars, config: c)
    let colored = r.series.wt1.filter { $0.color != nil && $0.color != MarketVisionConfig.Colors().colorWT1Fill }
    #expect(colored.count == 162)
    #expect(Self.bars.firstIndex { $0.time == colored.first?.time } == 238)
    let palette: Set<String> = [c.colors.macdWT1a, c.colors.macdWT1b, c.colors.macdWT1c, c.colors.macdWT1d]
    for p in colored { #expect(palette.contains(p.color!)) }
  }

  @Test func configPatch() {
    var c = MarketVisionConfig.default; c.rsi.length = 21
    let r = MarketVision.compute(Self.bars, config: c), d = MarketVision.compute(Self.bars)
    #expect(r.series.rsi.last?.value != d.series.rsi.last?.value)
    #expect(r.series.wt2.last?.value == d.series.wt2.last?.value)
  }
}

@Suite struct RsiDivergenceTests {
  static let bars = IndicatorFixtures.bars(count: 400, seed: 42)
  static let smooth = IndicatorFixtures.bars(count: 400, seed: 7)

  func rows(_ bars: [OHLCVBar], _ c: RsiDivergences.Config = .default) -> [[String]] {
    RsiDivergences.calculate(bars, config: c).divergences.map { d in
      [d.type.rawValue, String(d.startIndex), String(d.endIndex), String(format: "%.6f", d.rsiStart), String(format: "%.6f", d.rsiEnd), String(format: "%.6f", d.priceStart), String(format: "%.6f", d.priceEnd)]
    }
  }

  @Test func characterization() {
    #expect(rows(Self.bars).isEmpty)
    var same = RsiDivergences.Config.default; same.pairMode = .sameBar
    #expect(rows(Self.bars, same).isEmpty)
    var strict = RsiDivergences.Config.default; strict.allowEqual = false; strict.tolBars = 3; strict.leftBars = 3; strict.rightBars = 3
    #expect(rows(Self.bars, strict) == [
      ["bearish", "84", "102", "70.934380", "70.391753", "109.437589", "113.961544"],
      ["h_bearish", "109", "153", "60.392775", "62.411743", "111.854728", "105.449473"],
      ["h_bullish", "218", "260", "40.296273", "28.519861", "98.369259", "104.965011"],
      ["bearish", "307", "311", "81.965662", "81.850944", "117.676047", "119.836612"],
      ["h_bullish", "384", "390", "66.440028", "60.081326", "113.295541", "113.701131"],
    ])
    var closeMode = RsiDivergences.Config.default; closeMode.priceMode = .close
    #expect(rows(Self.bars, closeMode) == [["h_bullish", "218", "260", "40.296273", "28.519861", "99.567500", "105.585983"]])
    var tol4 = RsiDivergences.Config.default; tol4.tolBars = 4
    #expect(rows(Self.bars, tol4) == [["h_bullish", "218", "260", "40.296273", "28.519861", "98.369259", "104.965011"]])
    #expect(rows(Self.smooth) == [
      ["h_bullish", "217", "263", "41.494133", "32.333250", "98.715737", "105.051847"],
      ["h_bullish", "288", "357", "18.678285", "15.825658", "95.918147", "96.331927"],
    ])
    #expect(rows(Self.smooth, tol4) == [
      ["bearish", "77", "104", "79.036135", "75.248882", "109.738200", "113.092265"],
      ["h_bullish", "217", "263", "41.494133", "32.333250", "98.715737", "105.051847"],
    ])
    var noReg = tol4; noReg.showRegular = false
    #expect(rows(Self.smooth, noReg) == [["h_bullish", "217", "263", "41.494133", "32.333250", "98.715737", "105.051847"]])
    var noHid = tol4; noHid.showHidden = false
    #expect(rows(Self.smooth, noHid) == [["bearish", "77", "104", "79.036135", "75.248882", "109.738200", "113.092265"]])
  }

  @Test func rsiTailAndLevels() {
    let r = RsiDivergences.calculate(Self.bars)
    let tail = Array(r.rsiSeries.suffix(3))
    #expect(tail.map(\.epochSeconds) == [1701429200, 1701432800, 1701436400])
    #expect(abs(tail[0].value - 72.03216076) < 1e-7 && abs(tail[1].value - 74.7783765) < 1e-7 && abs(tail[2].value - 74.94443346) < 1e-7)
    #expect(RsiDivergences.zoneLevels.critBull == 80 && RsiDivergences.zoneLevels.critBear == 20)
    #expect(r.alertHigh == 85 && r.alertLow == 15 && !r.alertHighOn && !r.alertLowOn)
  }

  @Test func signalLine() {
    let r = RsiDivergences.calculate(Self.bars)
    let rsi = TechnicalIndicators.rsi(Self.bars.map(\.close), 14)
    let expected = TechnicalIndicators.ema(Array(rsi[14...]), 12)
    #expect(r.signalSeries.count == 400 - 14)
    #expect(r.signalSeries.first?.epochSeconds == Self.bars[14].time)
    for (i, p) in r.signalSeries.enumerated() { #expect(abs(p.value - expected[i]) < 1e-9) }
    #expect(r.signalCurrent == r.signalSeries.last?.value)
    var sma = RsiDivergences.Config.default; sma.signalType = .sma
    let rs = RsiDivergences.calculate(Self.bars, config: sma)
    #expect(rs.signalSeries.first?.epochSeconds == Self.bars[14 + 11].time)
    #expect(rs.signalSeries.count == 400 - 14 - 11)
    // EMA cross round trip
    for seed: UInt32 in [42, 7] {
      let b = IndicatorFixtures.bars(count: 400, seed: seed)
      let res = RsiDivergences.calculate(b)
      guard let cross = res.reverseSignalCross, let sig = res.signalCurrent else { Issue.record("nil cross"); continue }
      let fwd = TechnicalIndicators.rsi(b.map(\.close) + [cross], 14)
      #expect(abs(fwd.last! - sig) < 1e-6)
    }
    let short = RsiDivergences.calculate(Array(Self.bars.prefix(14)))
    #expect(short.signalSeries.isEmpty && short.signalCurrent == nil && short.reverseSignalCross == nil)
  }

  @Test func alerts() {
    func flat(_ f: (Int) -> Double, _ n: Int = 60) -> [OHLCVBar] { (0..<n).map { i in let c = f(i); return OHLCVBar(time: 1_700_000_000 + i * 3600, open: c, high: c, low: c, close: c, volume: 1000) } }
    let up = RsiDivergences.calculate(flat { 100 + Double($0) })
    #expect(up.alertHighOn && !up.alertLowOn)
    let down = RsiDivergences.calculate(flat { 200 - Double($0) })
    #expect(!down.alertHighOn && down.alertLowOn)
    let short = RsiDivergences.calculate(flat({ 100 + Double($0) }, 10))
    #expect(!short.alertHighOn && !short.alertLowOn)
    var c = RsiDivergences.Config.default; c.alertHigh = 90; c.alertLow = 10
    let custom = RsiDivergences.calculate(Self.bars, config: c)
    #expect(custom.alertHigh == 90 && custom.alertLow == 10)
  }

  @Test func reverseRsiRoundTrip() {
    for seed: UInt32 in [42, 7] {
      let closes = IndicatorFixtures.bars(count: 400, seed: seed).map(\.close)
      for period in [7, 14, 21] {
        guard let state = TechnicalIndicators.wilderRsiState(closes, period: period) else { Issue.record("state"); continue }
        for target in [80.0, 62, 50, 38, 20, 55.5, 12.3, 88] {
          guard let price = TechnicalIndicators.reverseRsiPrice(state, period: period, target: target) else { continue }
          let fwd = TechnicalIndicators.rsi(closes + [price], period)
          #expect(abs(fwd.last! - target) < 1e-6)
        }
      }
      let state = TechnicalIndicators.wilderRsiState(closes, period: 14)!
      for t in TechnicalIndicators.defaultReverseRsiTargets { #expect(TechnicalIndicators.reverseRsiPrice(state, period: 14, target: t) != nil) }
      let current = TechnicalIndicators.rsi(closes, 14).last!
      if current > 0 && current < 100 {
        #expect(abs(TechnicalIndicators.reverseRsiPrice(state, period: 14, target: current)! - closes.last!) < 1e-6)
      }
      let prices = [80.0, 62, 50, 38, 20].compactMap { TechnicalIndicators.reverseRsiPrice(state, period: 14, target: $0) }
      for i in 1..<prices.count { #expect(prices[i - 1] >= prices[i]) }
    }
    let flat = [Double](repeating: 100, count: 50)
    let fs = TechnicalIndicators.wilderRsiState(flat, period: 14)!
    #expect(fs.avgGain == 0 && fs.avgLoss == 0 && TechnicalIndicators.reverseRsiPrice(fs, period: 14, target: 50) == nil)
    let rising = (0..<60).map { 100.0 + Double($0) }
    #expect(TechnicalIndicators.rsi(rising, 14).last == 100)
    let rs = TechnicalIndicators.wilderRsiState(rising, period: 14)!
    let p = TechnicalIndicators.reverseRsiPrice(rs, period: 14, target: 50)!
    #expect(p < rising.last!)
    #expect(abs(TechnicalIndicators.rsi(rising + [p], 14).last! - 50) < 1e-6)
    let low = (0..<20).map { 1.0 + Double($0) }
    #expect(TechnicalIndicators.reverseRsiPrice(TechnicalIndicators.wilderRsiState(low, period: 14)!, period: 14, target: 1) == nil)
    #expect(TechnicalIndicators.wilderRsiState(Array(IndicatorFixtures.bars().map(\.close).prefix(14)), period: 14) == nil)
    #expect(TechnicalIndicators.reverseRsiLevels([1, 2, 3], period: 14).allSatisfy { $0.price == nil })
    let r = RsiDivergences.calculate(Self.bars)
    #expect(r.reverseLevels == TechnicalIndicators.reverseRsiLevels(Self.bars.map(\.close), period: 14))
  }

  @Test func pivotsMatchNaiveFractal() {
    for seed: UInt32 in [42, 7] {
      let bars = IndicatorFixtures.bars(count: 400, seed: seed)
      let rsi = TechnicalIndicators.rsi(bars.map(\.close), 14)
      let result = RsiDivergences.calculate(bars)
      var expected: [(Int, Bool)] = []
      for p in 5..<(rsi.count - 5) {
        var isHigh = true, isLow = true
        for j in (p - 5)...(p + 5) where j != p { if rsi[j] >= rsi[p] { isHigh = false }; if rsi[j] <= rsi[p] { isLow = false } }
        if isHigh { expected.append((p, true)) }
        if isLow { expected.append((p, false)) }
      }
      #expect(!result.pivots.isEmpty)
      let got = result.pivots.map { ($0.index, $0.isHigh) }.sorted { $0.0 == $1.0 ? ($0.1 ? 1 : 0) < ($1.1 ? 1 : 0) : $0.0 < $1.0 }
      let exp = expected.sorted { $0.0 == $1.0 ? ($0.1 ? 1 : 0) < ($1.1 ? 1 : 0) : $0.0 < $1.0 }
      #expect(got.count == exp.count)
      for (g, e) in zip(got, exp) { #expect(g.0 == e.0 && g.1 == e.1) }
    }
  }
}

@Suite struct VmcDivergenceTests {
  @Test func regularBearish() {
    let src: [Double] = [0, 40, 60, 80, 60, 40, 30, 50, 60, 70, 55, 40, 0]
    let high: [Double] = [100, 101, 105, 110, 105, 101, 100, 103, 110, 120, 110, 103, 100]
    let res = VmcDivergences.find(src: src, priceHigh: high, priceLow: high.map { $0 - 2 }, topLimit: 0, botLimit: 0, useLimits: false)
    #expect(res.fractalTop[5] && res.fractalTop[11] && res.bearDiv[11] && !res.bearHidden[11])
    #expect(res.prevTopPivotIndex[11] == 3 && res.prevTopSrc[11] == 80 && res.prevTopPriceHigh[11] == 110)
  }
  @Test func regularBullish() {
    let src: [Double] = [0, -40, -60, -80, -60, -40, -30, -50, -55, -60, -50, -40, 0]
    let low: [Double] = [100, 96, 93, 90, 93, 96, 100, 97, 90, 80, 90, 97, 100]
    let res = VmcDivergences.find(src: src, priceHigh: low.map { $0 + 2 }, priceLow: low, topLimit: 0, botLimit: 0, useLimits: false)
    #expect(res.fractalBot[5] && res.fractalBot[11] && res.bullDiv[11] && !res.bullHidden[11])
    #expect(res.prevBotPivotIndex[11] == 3 && res.prevBotSrc[11] == -80 && res.prevBotPriceLow[11] == 90)
  }
  @Test func hiddenAndLimits() {
    let src: [Double] = [0, 40, 60, 70, 60, 40, 30, 50, 60, 80, 55, 40, 0]
    let high: [Double] = [100, 101, 105, 120, 105, 101, 100, 103, 106, 110, 106, 103, 100]
    let res = VmcDivergences.find(src: src, priceHigh: high, priceLow: high.map { $0 - 2 }, topLimit: 0, botLimit: 0, useLimits: false)
    #expect(!res.bearDiv[11] && res.bearHidden[11])
    let src2: [Double] = [0, 40, 60, 80, 60, 40, 30, 50, 60, 70, 55, 40, 0]
    let high2: [Double] = [100, 101, 105, 110, 105, 101, 100, 103, 110, 120, 110, 103, 100]
    let gated = VmcDivergences.find(src: src2, priceHigh: high2, priceLow: high2.map { $0 - 2 }, topLimit: 75, botLimit: -75, useLimits: true)
    #expect(gated.fractalTop[5] && !gated.fractalTop[11] && !gated.bearDiv[11])
    #expect(VmcDivergences.find(src: src2, priceHigh: high2, priceLow: high2.map { $0 - 2 }, topLimit: 45, botLimit: -65, useLimits: true).bearDiv[11])
    let nan: [Double] = [0, 40, .nan, 80, 60, 40, 30, 50, 60, 70, 55, 40, 0]
    let r3 = VmcDivergences.find(src: nan, priceHigh: high2, priceLow: high2.map { $0 - 2 }, topLimit: 0, botLimit: 0, useLimits: false)
    #expect(!r3.fractalTop[5] && !r3.bearDiv[11])
  }
}

@Suite struct TimeframeTests {
  @Test func parse() {
    #expect(Timeframes.parsePineTimeframeMinutes("60") == 60 && Timeframes.parsePineTimeframeMinutes(" 720 ") == 720)
    #expect(Timeframes.parsePineTimeframeMinutes("") == nil && Timeframes.parsePineTimeframeMinutes("D") == nil && Timeframes.parsePineTimeframeMinutes("-5") == nil)
  }
  @Test func resampleAndHeikinAshi() {
    func b(_ t: Int, _ o: Double, _ h: Double, _ l: Double, _ c: Double) -> OHLCVBar { OHLCVBar(time: t, open: o, high: h, low: l, close: c, volume: 1) }
    let hourly = [b(0, 10, 12, 9, 11), b(3600, 11, 15, 10, 14), b(7200, 14, 16, 13, 15), b(10800, 15, 17, 14, 16), b(14400, 16, 18, 12, 13), b(18000, 13, 14, 11, 12)]
    let rs = Timeframes.resample(hourly, toSeconds: 7200)
    #expect(rs.count == 3)
    #expect(rs[0] == OHLCVBar(time: 0, open: 10, high: 15, low: 9, close: 14, volume: 2))
    #expect(rs[2] == OHLCVBar(time: 14400, open: 16, high: 18, low: 11, close: 12, volume: 2))
    let map = Timeframes.baseToResampledIndexMap(base: hourly, resampled: rs, targetSeconds: 7200)
    #expect(map == [0, 0, 1, 1, 2, 2])
    #expect(Timeframes.alignHtfValuesToBase(map, [1, 2, 3], lookahead: .on) == [1, 1, 2, 2, 3, 3])
    let off = Timeframes.alignHtfValuesToBase(map, [1, 2, 3], lookahead: .off)
    #expect(off[0].isNaN && off[2] == 1 && off[4] == 2)
    let ha = Timeframes.toHeikinAshi(rs)
    #expect(ha[0].open == 12 && ha[0].close == 12)
    #expect(Timeframes.canResampleToMinutes(hourly, 120) && !Timeframes.canResampleToMinutes(hourly, 30))
  }
  @Test func bbwpAndBollinger() {
    let bars = IndicatorFixtures.bars(count: 400, seed: 42)
    let bb = BollingerBands.calculate(bars)
    #expect(bb.indicator.count == 400 && bb.upper.count > 300 && bb.percentB != nil)
    let bw = BBWP.calculate(bars)
    #expect(!bw.bbwp.isEmpty && bw.bbwp.allSatisfy { $0.value >= 0 && $0.value <= 100 })
    #expect(!bw.ma.isEmpty)
  }
}
