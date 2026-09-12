import Foundation

/// Port of `market-vision-config.ts` (Pine v4 parity: VuManChu B Divergences).
public struct MarketVisionConfig: Sendable, Hashable {
  public struct WaveTrend: Sendable, Hashable {
    public var wtShow = true, wtBuyShow = true, wtGoldShow = true, wtSellShow = true, wtDivShow = true, vwapShow = true
    public var wtChannelLen = 9, wtAverageLen = 12
    public var wtMASource: VmcSource = .hlc3
    public var wtMALen = 3
    public var obLevel = 53.0, obLevel2 = 60.0, obLevel3 = 100.0, osLevel = -53.0, osLevel2 = -60.0, osLevel3 = -75.0
    public var wtShowDiv = true, wtShowHiddenDiv = false, showHiddenDivNl = true
    public var wtDivOBLevel = 45.0, wtDivOSLevel = -65.0
    public var wtDivOBLevelAddShow = true
    public var wtDivOBLevelAdd = 15.0, wtDivOSLevelAdd = -40.0
    public init() {}
  }
  public struct Mfi: Sendable, Hashable { public var rsiMFIShow = true; public var period = 60; public var multiplier = 150.0; public var posY = 2.5; public init() {} }
  public struct Rsi: Sendable, Hashable {
    public var rsiShow = true; public var source: VmcSource = .close; public var length = 14
    public var oversold = 30.0, overbought = 60.0
    public var showDiv = false, showHiddenDiv = false
    public var divOBLevel = 60.0, divOSLevel = 30.0
    public init() {}
  }
  public struct Stoch: Sendable, Hashable {
    public var show = true, useLog = true, avg = false
    public var source: VmcSource = .close
    public var length = 14, rsiLength = 14, kSmooth = 3, dSmooth = 3
    public var showDiv = false, showHiddenDiv = false
    public init() {}
  }
  public struct Schaff: Sendable, Hashable { public var tcLine = false; public var source: VmcSource = .close; public var length = 10, fastLength = 23, slowLength = 50; public var factor = 0.5; public init() {} }
  public struct SommiFlag: Sendable, Hashable {
    public var show = false, showVwap = false
    public var vwapTF = "720"
    public var vwapBearLevel = 0.0, vwapBullLevel = 0.0, wtBearLevel = 0.0, wtBullLevel = 0.0, rsiMfiBearLevel = 0.0, rsiMfiBullLevel = 0.0
    public init() {}
  }
  public struct SommiDiamond: Sendable, Hashable { public var show = false; public var htcRes = "60", htcRes2 = "240"; public var wtBearLevel = 0.0, wtBullLevel = 0.0; public init() {} }
  public struct MacdColors: Sendable, Hashable { public var show = false; public var tf = "240"; public init() {} }
  public struct Engine: Sendable, Hashable {
    public var enabled = true; public var leftBars = 5, rightBars = 5; public var pairMode: PairMode = .tvLike; public var tolBars = 2
    public var allowEqual = true; public var priceEps = 0.0, oscEps = 0.0
    public init() {}
  }
  public struct Colors: Sendable, Hashable {
    public var colorRed = "oklch(0.628 0.2577 29.23)", colorPurple = "oklch(0.649 0.2983 328.36)", colorGreen = "oklch(0.8722 0.287 141.02)"
    public var colorOrange = "oklch(0.7576 0.1564 81.3)", colorYellow = "oklch(0.9147 0.1908 101.03)", colorWhite = "oklch(1 0 0)"
    public var colorPink = "oklch(0.6931 0.3133 331.66)", colorBluelight = "oklch(0.7623 0.1457 233.27)"
    public var colorWT1Fill = "oklch(0.66 0.1513 254.09)", colorWT2Fill = "oklch(0.2608 0.1153 281.53)", vwapColor = "oklch(1 0 0 / 0.5)"
    public var rsiOverbought = "oklch(0.6069 0.2 25.46)", rsiOversold = "oklch(0.7978 0.2362 143.47)", rsiInBetween = "oklch(0.6217 0.2474 319.5)"
    public var mfiAbove = "oklch(0.7978 0.2362 143.47)", mfiBelow = "oklch(0.6556 0.231 29.33)"
    public var wtBearDiv = "oklch(0.5808 0.2383 29.23)", wtBullDiv = "oklch(0.8099 0.2141 151.77)"
    public var stochK = "oklch(0.7404 0.142 230.37 / 0.3)", stochD = "oklch(0.4742 0.1862 294.78 / 0.1)"
    public var sommiBear = "oklch(0.6931 0.3133 331.66)", sommiBull = "oklch(0.7623 0.1457 233.27)"
    public var macdWT1a = "oklch(0.6743 0.1551 145.92)", macdWT1b = "oklch(0.5446 0.1301 22.36)", macdWT1c = "oklch(0.8353 0.1698 143.87)", macdWT1d = "oklch(0.6504 0.2355 26.83)"
    public var macdWT2a = "oklch(0.4139 0.0757 144.06)", macdWT2b = "oklch(0.1987 0.0787 28.47)", macdWT2c = "oklch(0.2332 0.035 144.35)", macdWT2d = "oklch(0.3575 0.1467 29.23)"
    public init() {}
  }

  public var waveTrend = WaveTrend()
  public var mfi = Mfi()
  public var rsi = Rsi()
  public var stoch = Stoch()
  public var schaff = Schaff()
  public var sommiFlag = SommiFlag()
  public var sommiDiamond = SommiDiamond()
  public var macdColors = MacdColors()
  public var engine = Engine()
  public var colors = Colors()

  public init() {}
  public static let `default` = MarketVisionConfig()
}

public struct ColoredPoint: Sendable, Hashable {
  public var time: Int
  public var value: Double
  public var color: String?
  public init(time: Int, value: Double, color: String? = nil) { self.time = time; self.value = value; self.color = color }
  public var point: TimePoint { TimePoint(epochSeconds: time, value: value) }
}

public struct MarketVisionSeries: Sendable, Hashable {
  public var wt1: [ColoredPoint] = [], wt2: [ColoredPoint] = [], wtVwap: [ColoredPoint] = []
  public var rsiMfi: [ColoredPoint] = [], mfiBarTop: [ColoredPoint] = [], mfiBarBottom: [ColoredPoint] = []
  public var rsi: [ColoredPoint] = []
  public var stochK: [ColoredPoint] = [], stochD: [ColoredPoint] = []
  public var tc: [ColoredPoint] = [], sommiHvwap: [ColoredPoint] = []
  public var wtBearDiv: [ColoredPoint] = [], wtBullDiv: [ColoredPoint] = [], wtBearDiv2: [ColoredPoint] = [], wtBullDiv2: [ColoredPoint] = []
  public var rsiBearDiv: [ColoredPoint] = [], rsiBullDiv: [ColoredPoint] = [], stochBearDiv: [ColoredPoint] = [], stochBullDiv: [ColoredPoint] = []
  public var wtCrossCircles: [ColoredPoint] = [], buyCircle: [ColoredPoint] = [], sellCircle: [ColoredPoint] = []
  public var divBuyCircle: [ColoredPoint] = [], divSellCircle: [ColoredPoint] = [], goldBuyCircle: [ColoredPoint] = []
  public var sommiBearFlag: [ColoredPoint] = [], sommiBullFlag: [ColoredPoint] = [], sommiBearDiamond: [ColoredPoint] = [], sommiBullDiamond: [ColoredPoint] = []
  public init() {}
}

public struct MarketVisionEvent: Sendable, Hashable { public var time: Int; public var index: Int }

public struct MarketVisionEvents: Sendable, Hashable {
  public var buy: [MarketVisionEvent] = [], sell: [MarketVisionEvent] = [], buyDiv: [MarketVisionEvent] = [], sellDiv: [MarketVisionEvent] = []
  public var goldBuy: [MarketVisionEvent] = [], smallBuyDot: [MarketVisionEvent] = [], smallSellDot: [MarketVisionEvent] = []
  public var sommiBullFlag: [MarketVisionEvent] = [], sommiBearFlag: [MarketVisionEvent] = [], sommiBullDiamond: [MarketVisionEvent] = [], sommiBearDiamond: [MarketVisionEvent] = []
  public init() {}
}

public struct TimedDivergence: Sendable, Hashable {
  public var type: DivergenceType
  public var startIndex: Int, endIndex: Int
  public var startTime: Int, endTime: Int
  public var oscStart: Double, oscEnd: Double, priceStart: Double, priceEnd: Double
}

public struct MarketVisionResult: Sendable, Hashable {
  public var series = MarketVisionSeries()
  public var zeroLevel: [ColoredPoint] = [], ob2Level: [ColoredPoint] = [], ob3Level: [ColoredPoint] = [], os2Level: [ColoredPoint] = []
  public var events = MarketVisionEvents()
  public var wtDivergences: [TimedDivergence] = [], rsiDivergences: [TimedDivergence] = [], stochDivergences: [TimedDivergence] = []
  public init() {}
}
