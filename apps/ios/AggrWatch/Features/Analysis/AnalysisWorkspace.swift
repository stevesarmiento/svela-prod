import SwiftUI

/// Sidebar on wide displays, report/data switcher on a phone. Switching panels never restarts analysis.
struct AnalysisWorkspace<Header: View, Chart: View, Metrics: View, Report: View>: View {
  @ViewBuilder var header: () -> Header
  @ViewBuilder var chart: () -> Chart
  @ViewBuilder var metrics: () -> Metrics
  @ViewBuilder var report: () -> Report
  @State private var showMetrics = false

  var body: some View {
    GeometryReader { geometry in
      if geometry.size.width >= 760 {
        HStack(alignment: .top, spacing: 0) {
          ScrollView {
            VStack(alignment: .leading, spacing: 22) { header(); chart(); Divider(); metrics() }.padding(20)
          }.frame(width: 340)
          Divider()
          ScrollView { report().padding(24).frame(maxWidth: .infinity, alignment: .leading) }
        }
      } else {
        VStack(spacing: 0) {
          Picker("Analysis content", selection: $showMetrics) {
            Text("Report").tag(false)
            Text("Market data").tag(true)
          }
          .pickerStyle(.segmented)
          .padding(.horizontal, 16).padding(.vertical, 10)
          .accessibilityIdentifier("analysis-content-picker")
          ScrollView {
            VStack(alignment: .leading, spacing: 22) {
              header()
              chart()
              Divider()
              if showMetrics { metrics() } else { report() }
            }
            .padding(16).padding(.bottom, 24)
          }
          .id(showMetrics) // Each panel starts at its heading, rather than inheriting a long report's offset.
          .accessibilityIdentifier(showMetrics ? "analysis-data-scroll" : "analysis-report-scroll")
        }
      }
    }
    .background(Color.black.opacity(0.35))
  }
}

struct AnalysisReport: View {
  let text: String
  let isLoading: Bool
  let failed: Bool
  let steps: [String]
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Market overview").font(.title3.bold()).accessibilityAddTraits(.isHeader)
      if isLoading && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        MultiStepLoader(steps: steps, interval: .milliseconds(2200))
      } else if failed {
        Label("Analysis unavailable", systemImage: "exclamationmark.triangle").foregroundStyle(.secondary)
        Text(text).foregroundStyle(.secondary)
      } else {
        StreamingMarkdownText(text: text)
        if isLoading { ProgressView("Writing analysis…").font(.caption) }
        else if !text.isEmpty { Text("AI-generated. Not financial advice.").font(.caption2).foregroundStyle(.tertiary) }
      }
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}
