import Testing
@testable import AggrCore

// Port of apps/app/src/lib/oklch.test.ts
@Suite struct OklchTests {
  @Test func parsesBareAndSlashAlpha() {
    #expect(OklchColor.parse("oklch(0.628 0.2577 29.23)") == Oklch(l: 0.628, c: 0.2577, h: 29.23, alpha: 1))
    #expect(OklchColor.parse("oklch(62.8% 0.2577 29.23 / 0.5)") == Oklch(l: 0.628, c: 0.2577, h: 29.23, alpha: 0.5))
  }

  @Test func rejectsNonOklch() {
    #expect(OklchColor.parse("#ff0000") == nil)
    #expect(OklchColor.parse("rgba(0,0,0,0.5)") == nil)
    #expect(OklchColor.parse("hsl(var(--primary))") == nil)
    #expect(OklchColor.parse("transparent") == nil)
  }

  @Test func rgbAnchors() {
    #expect(OklchColor.toRgb(Oklch(l: 1, c: 0, h: 0)) == (255, 255, 255))
    #expect(OklchColor.toRgb(Oklch(l: 0, c: 0, h: 0)) == (0, 0, 0))
    #expect(OklchColor.toRgb(Oklch(l: 0.6279, c: 0.2577, h: 29.23)) == (255, 0, 0))
  }

  @Test(arguments: [(255.0, 255.0, 255.0), (0, 0, 0), (255, 0, 0), (229, 231, 235), (135, 135, 135), (47, 44, 48), (153, 69, 255)])
  func srgbRoundTrips(_ rgb: (Double, Double, Double)) {
    let s = OklchColor.srgbToString(rgb.0, rgb.1, rgb.2)
    let parsed = OklchColor.parse(s)
    #expect(parsed != nil)
    #expect(OklchColor.toRgb(parsed!) == (Int(rgb.0), Int(rgb.1), Int(rgb.2)))
  }

  @Test func achromaticPinsHue() {
    let s = OklchColor.srgbToString(128, 128, 128)
    #expect(s.range(of: #"^oklch\([\d.]+ 0 0\)$"#, options: .regularExpression) != nil, "got \(s)")
  }

  @Test func alphaSlashSyntax() {
    #expect(OklchColor.srgbToString(255, 255, 255, alpha: 0.5) == "oklch(1 0 0 / 0.5)")
  }

  @Test func stringSurgery() {
    #expect(OklchColor.withAlpha("oklch(0.5 0.1 200)", 0.3) == "oklch(0.5 0.1 200 / 0.3)")
    #expect(OklchColor.withAlpha("oklch(0.5 0.1 200 / 0.9)", 0.3) == "oklch(0.5 0.1 200 / 0.3)")
    #expect(OklchColor.withAlpha("#fff", 0.3) == "#fff")
    #expect(OklchColor.multiplyAlpha("oklch(0.5 0.1 200 / 0.5)", 0.5) == "oklch(0.5 0.1 200 / 0.25)")
    #expect(OklchColor.toRgbString("oklch(1 0 0)") == "rgb(255, 255, 255)")
    #expect(OklchColor.toRgbString("oklch(1 0 0 / 0.5)") == "rgba(255, 255, 255, 0.5)")
    #expect(OklchColor.toRgbString("not-a-color") == "not-a-color")
  }

  @Test func pastelGeneration() {
    #expect(ChartColors.generatePastelColors(3).count == 3)
    #expect(ChartColors.generatePastelColors(15).count == 15)
    #expect(ChartColors.generatePastelColors(15)[14].hasPrefix("oklch("))
  }
}
