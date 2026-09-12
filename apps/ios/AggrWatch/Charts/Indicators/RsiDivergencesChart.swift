import AggrCore
import Charts
import SwiftUI

/// Port of `rsi-divergences-chart.tsx`: Caretaker zones, RSI + signal line, pivots and divergence segments.
struct RsiDivergencesChart: View {
  let result: RsiDivergences.Result
  let windowDays: Int
  @Binding var selectedDate: Date?
  var height: CGFloat = 250
  var showLabels = true

  var body: some View {
    let rsi = result.rsiSeries.chartPoints
    let signal = result.signalSeries.chartPoints
    let z = RsiDivergences.zoneLevels
    Chart {
      if let first = rsi.first?.date, let last = rsi.last?.date {
        RectangleMark(xStart: .value("s", first), xEnd: .value("e", last), yStart: .value("a", z.critBull), yEnd: .value("b", 100)).foregroundStyle(Color.lossRed.opacity(0.10))
        RectangleMark(xStart: .value("s", first), xEnd: .value("e", last), yStart: .value("a", z.contBull), yEnd: .value("b", z.critBull)).foregroundStyle(Color.lossRed.opacity(0.04))
        RectangleMark(xStart: .value("s", first), xEnd: .value("e", last), yStart: .value("a", z.contBear), yEnd: .value("b", z.middle)).foregroundStyle(Color.gainGreen.opacity(0.0))
        RectangleMark(xStart: .value("s", first), xEnd: .value("e", last), yStart: .value("a", z.critBear), yEnd: .value("b", z.contBear)).foregroundStyle(Color.gainGreen.opacity(0.04))
        RectangleMark(xStart: .value("s", first), xEnd: .value("e", last), yStart: .value("a", 0), yEnd: .value("b", z.critBear)).foregroundStyle(Color.gainGreen.opacity(0.10))
      }
      ForEach([z.critBull, z.contBull, z.middle, z.contBear, z.critBear], id: \.self) { lvl in
        RuleMark(y: .value("lvl", lvl)).foregroundStyle(Color.white.opacity(lvl == z.middle ? 0.2 : 0.1)).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
      }
      if result.alertHighOn { RuleMark(y: .value("ah", result.alertHigh)).foregroundStyle(Color.lossRed.opacity(0.5)) }
      if result.alertLowOn { RuleMark(y: .value("al", result.alertLow)).foregroundStyle(Color.gainGreen.opacity(0.5)) }
      ForEach(signal) { p in
        LineMark(x: .value("t", p.date), y: .value("Signal", p.value), series: .value("s", "signal"))
          .foregroundStyle(Color.orange.opacity(0.7)).lineStyle(StrokeStyle(lineWidth: 1)).interpolationMethod(.monotone)
      }
      ForEach(rsi) { p in
        LineMark(x: .value("t", p.date), y: .value("RSI", p.value), series: .value("s", "rsi"))
          .foregroundStyle(Color(oklch: ChartColors.pastel[0])).lineStyle(StrokeStyle(lineWidth: 1.75)).interpolationMethod(.monotone)
      }
      ForEach(Array(result.pivots.enumerated()), id: \.offset) { _, pv in
        PointMark(x: .value("t", Date(timeIntervalSince1970: TimeInterval(pv.time))), y: .value("v", pv.value))
          .symbol(.triangle).symbolSize(pv.isHigh ? 22 : 22)
          .foregroundStyle(pv.isHigh ? Color.lossRed.opacity(0.8) : Color.gainGreen.opacity(0.8))
      }
      ForEach(Array(result.divergences.enumerated()), id: \.offset) { i, d in
        let color = d.type.isBullish ? Color.gainGreen : Color.lossRed
        let hidden = d.type == .h_bullish || d.type == .h_bearish
        LineMark(x: .value("t", Date(timeIntervalSince1970: TimeInterval(d.startTime))), y: .value("v", d.rsiStart), series: .value("s", "d\(i)"))
          .foregroundStyle(color).lineStyle(StrokeStyle(lineWidth: 1.5, dash: hidden ? [3, 3] : []))
        LineMark(x: .value("t", Date(timeIntervalSince1970: TimeInterval(d.endTime))), y: .value("v", d.rsiEnd), series: .value("s", "d\(i)"))
          .foregroundStyle(color).lineStyle(StrokeStyle(lineWidth: 1.5, dash: hidden ? [3, 3] : []))
          .annotation(position: d.type.isBullish ? .bottom : .top, spacing: 2) {
            if showLabels {
              Text(label(d.type)).font(.system(size: 8, weight: .semibold)).foregroundStyle(color)
            }
          }
      }
      ScrubRule(date: selectedDate)
    }
    .chartXSelection(value: $selectedDate)
    .indicatorPane(windowDays: windowDays, lastDate: rsi.last?.date, yDomain: 0...100, height: height)
    .chartLegend(.hidden)
  }

  private func label(_ t: DivergenceType) -> String {
    switch t { case .bullish: "Bull"; case .bearish: "Bear"; case .h_bullish: "H Bull"; case .h_bearish: "H Bear" }
  }
}
