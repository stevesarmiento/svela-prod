import Foundation

/// Port of `apps/app/src/components/watchlist-group-icon-options.ts` + the icon map in
/// `watchlist-group-icon.tsx`. Symbol keys map to SF Symbols (the web uses symbols-react, i.e. SF Symbols).
public enum WatchlistGroupIcons {
  public struct Option: Sendable, Hashable, Identifiable {
    public var key: String
    public var label: String
    public var id: String { key }
  }

  public static let emojis: [Option] = [
    ("💩","Poop"),("🚀","Rocket"),("💎","Diamond"),("🔥","Fire"),("⭐","Star"),("👑","Crown"),("🎯","Target"),
    ("💰","Money bag"),("🌙","Moon"),("⚡","Lightning"),("🦄","Unicorn"),("🐻","Bear"),("🐂","Bull"),("💀","Skull"),
    ("🎪","Circus"),("🌈","Rainbow"),("🔮","Crystal ball"),("🎭","Theater"),("🎲","Dice"),("🎨","Art"),("📈","Chart up"),
    ("📉","Chart down"),("💹","Markets"),("📊","Bar chart"),("🏦","Bank"),("🧠","Brain"),("🏆","Trophy"),("🎁","Gift"),
    ("🐋","Whale"),("🦅","Eagle"),("🌊","Wave"),("☀️","Sun"),("🍀","Clover"),("✨","Sparkles"),("🤖","Robot"),("🪙","Coin"),
    ("⚙️","Gear"),("🛡️","Shield"),("🌍","Globe"),("👀","Eyes"),("🧪","Science"),("🏠","Home"),("🎵","Music"),("🍕","Pizza"),
    ("⚽","Soccer"),("🎮","Video game"),("💼","Briefcase"),("🧊","Ice"),
  ].map { Option(key: $0.0, label: $0.1) }

  public static let symbols: [Option] = [
    ("sparkles","Sparkles"),("graduation-cap","Graduation cap"),("star","Star"),("fire","Flame"),("lightning","Lightning"),
    ("diamond","Diamond"),("crown","Crown"),("target","Target"),("moon","Moon"),("chart","Chart up"),("chart-down","Chart down"),
    ("bars","Bars"),("eye","Eye"),("time","Time"),("bell","Bell"),("heart","Heart"),("bookmark","Bookmark"),("seal","Seal"),
    ("dots","Dots"),("banknote","Banknote"),("bitcoin","Bitcoin"),("wallet","Wallet"),("globe","Globe"),("shield","Shield"),
    ("trophy","Trophy"),("gift","Gift"),("infinity","Infinity"),("rainbow","Rainbow"),("house","House"),("flag","Flag"),
    ("party","Party"),("balloon","Balloon"),("leaf","Leaf"),("tree","Tree"),("pawprint","Paw"),("fish","Fish"),("cat","Cat"),
    ("dog","Dog"),("camera","Camera"),("game","Game"),("american-football","Football"),("volleyball","Volleyball"),("sketch","Sketch"),
  ].map { Option(key: $0.0, label: $0.1) }

  static let sfSymbolByKey: [String: String] = [
    "sparkles": "sparkles", "graduation-cap": "graduationcap.fill", "star": "star.fill", "fire": "flame.fill",
    "lightning": "bolt.fill", "diamond": "diamond.fill", "crown": "crown.fill", "target": "target", "moon": "moon.stars",
    "american-football": "american.football.fill", "volleyball": "volleyball.fill",
    "chart": "chart.line.uptrend.xyaxis", "chart-down": "chart.line.downtrend.xyaxis", "bars": "chart.bar",
    "eye": "eye.fill", "time": "timelapse", "bell": "bell.fill", "heart": "heart.fill", "bookmark": "bookmark.fill",
    "sketch": "scribble.variable", "seal": "seal.fill", "dots": "circle.dotted.and.circle",
    "banknote": "banknote.fill", "bitcoin": "bitcoinsign.circle.fill", "wallet": "wallet.bifold.fill",
    "globe": "globe.americas.fill", "shield": "shield.fill", "trophy": "trophy.fill", "gift": "gift.fill",
    "leaf": "leaf.fill", "tree": "tree.fill", "pawprint": "pawprint.fill", "fish": "fish.fill", "cat": "cat.fill",
    "dog": "dog.fill", "party": "party.popper.fill", "balloon": "balloon.fill", "rainbow": "rainbow",
    "infinity": "infinity.circle.fill", "house": "house.fill", "flag": "flag.fill", "camera": "camera.fill",
    "game": "gamecontroller.fill",
  ]

  public static let defaultKey = "sparkles"

  public enum Resolved: Sendable, Hashable {
    case emoji(String)
    case sfSymbol(String)
  }

  /// Resolves a stored `icon` value into an emoji or SF Symbol name (defaults to sparkles like the web).
  public static func resolve(_ icon: String?) -> Resolved {
    let key = (icon?.isEmpty == false) ? icon! : defaultKey
    if let sf = sfSymbolByKey[key] { return .sfSymbol(sf) }
    if emojis.contains(where: { $0.key == key }) { return .emoji(key) }
    // Unknown key: if it looks like an emoji render it, else fall back to sparkles.
    if key.unicodeScalars.contains(where: { $0.properties.isEmojiPresentation || $0.properties.isEmoji && $0.value > 0x238C }) {
      return .emoji(key)
    }
    return .sfSymbol(sfSymbolByKey[defaultKey]!)
  }
}
