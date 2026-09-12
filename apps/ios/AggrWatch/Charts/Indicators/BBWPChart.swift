import AggrCore
import Charts
import SwiftUI

/// Port of `bbwp-chart.tsx`: 0–100 percentile line with 5-point spectrum, MA line, extreme bands.
struct BBWPChart: View {
  let result: BBWP.Result
  let windowDays: Int
  @Binding var selectedDate: Date?
  var height: CGFloat = 250

  /// `spectrumPreset: "5point"` blue → cyan → green → yellow → red across 0..100.
  private let spectrum = LinearGradient(colors: [.blue, .cyan, .green, .yellow, .red], startPoint: .bottom, endPoint: .top)

  var body: some View {
    let line = result.bbwp.chartPoints
    let ma = result.ma.chartPoints
    Chart {
      if let first = line.first?.date, let last = line.last?.date {
        RectangleMark(xStart: .value("s", first), xEnd: .value("e", last), yStart: .value("a", result.extremeHigh), yEnd: .value("b", 100))
          .foregroundStyle(Color.lossRed.opacity(0.12))
        RectangleMark(xStart: .value("s", first), xEnd: .value("e", last), yStart: .value("a", 0), yEnd: .value("b", result.extremeLow))
          .foregroundStyle(Color.gainGreen.opacity(0.12))
      }
      RuleMark(y: .value("hi", result.extremeHigh)).foregroundStyle(Color.lossRed.opacity(0.4)).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
      RuleMark(y: .value("lo", result.extremeLow)).foregroundStyle(Color.gainGreen.opacity(0.4)).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
      RuleMark(y: .value("50", 50)).foregroundStyle(Color.white.opacity(0.1))
      ForEach(ma) { p in
        LineMark(x: .value("t", p.date), y: .value("MA", p.value), series: .value("s", "ma"))
          .foregroundStyle(Color.white.opacity(0.55)).lineStyle(StrokeStyle(lineWidth: 1.5, dash: [3, 3])).interpolationMethod(.monotone)
      }
      ForEach(line) { p in
        LineMark(x: .value("t", p.date), y: .value("BBWP", p.value), series: .value("s", "bbwp"))
          .foregroundStyle(spectrum).lineStyle(StrokeStyle(lineWidth: 2)).interpolationMethod(.monotone)
      }
      ScrubRule(date: selectedDate)
    }
    .chartXSelection(value: $selectedDate)
    .indicatorPane(windowDays: windowDays, lastDate: line.last?.date, yDomain: 0...100, height: height)
    .chartLegend(.hidden)
  }
}
