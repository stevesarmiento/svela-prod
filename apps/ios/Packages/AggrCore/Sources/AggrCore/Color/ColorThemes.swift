import Foundation

/// Port of `COLORS` / `COLOR_THEMES` in `apps/app/src/components/color-picker.tsx`.
/// Tailwind v4 class names resolved to their oklch() values (tailwindcss@4 theme.css).
public struct ColorTheme: Sendable, Hashable, Identifiable {
  public var key: String
  public var name: String
  /// Card background (`bg-*-700` etc.) as an oklch() string.
  public var background: String
  /// Card border (`border-*-600` etc.) as an oklch() string.
  public var border: String
  /// Accent text used for the aggregate % (`text-*-300`).
  public var accentText: String
  public var id: String { key }
}

public enum ColorThemes {
  static let tw: [String: String] = [
    "red-300": "oklch(0.808 0.114 19.571)", "red-500": "oklch(0.637 0.237 25.331)", "red-700": "oklch(0.505 0.213 27.518)", "red-800": "oklch(0.444 0.177 26.899)", "red-900": "oklch(0.396 0.141 25.723)",
    "orange-300": "oklch(0.837 0.128 66.29)", "orange-600": "oklch(0.646 0.222 41.116)", "orange-700": "oklch(0.553 0.195 38.402)", "orange-800": "oklch(0.47 0.157 37.304)", "orange-900": "oklch(0.408 0.123 38.172)",
    "amber-300": "oklch(0.879 0.169 91.605)", "amber-600": "oklch(0.666 0.179 58.318)", "amber-700": "oklch(0.555 0.163 48.998)",
    "yellow-300": "oklch(0.905 0.182 98.111)", "yellow-600": "oklch(0.681 0.162 75.834)", "yellow-700": "oklch(0.554 0.135 66.442)",
    "lime-300": "oklch(0.897 0.196 126.665)", "lime-600": "oklch(0.648 0.2 131.684)", "lime-700": "oklch(0.532 0.157 131.589)",
    "green-300": "oklch(0.871 0.15 154.449)", "green-700": "oklch(0.527 0.154 150.069)",
    "emerald-300": "oklch(0.845 0.143 164.978)", "emerald-500": "oklch(0.696 0.17 162.48)", "emerald-600": "oklch(0.596 0.145 163.225)", "emerald-700": "oklch(0.508 0.118 165.612)",
    "teal-300": "oklch(0.855 0.138 181.071)", "teal-600": "oklch(0.6 0.118 184.704)", "teal-700": "oklch(0.511 0.096 186.391)",
    "cyan-300": "oklch(0.865 0.127 207.078)", "cyan-600": "oklch(0.609 0.126 221.723)", "cyan-700": "oklch(0.52 0.105 223.128)",
    "sky-300": "oklch(0.828 0.111 230.318)", "sky-600": "oklch(0.588 0.158 241.966)", "sky-700": "oklch(0.5 0.134 242.749)",
    "blue-300": "oklch(0.809 0.105 251.813)", "blue-600": "oklch(0.546 0.245 262.881)", "blue-700": "oklch(0.488 0.243 264.376)", "blue-900": "oklch(0.379 0.146 265.522)", "blue-950": "oklch(0.282 0.091 267.935)",
    "indigo-300": "oklch(0.785 0.115 274.713)", "indigo-600": "oklch(0.511 0.262 276.966)", "indigo-700": "oklch(0.457 0.24 277.023)",
    "violet-300": "oklch(0.811 0.111 293.571)", "violet-600": "oklch(0.541 0.281 293.009)", "violet-700": "oklch(0.491 0.27 292.581)",
    "purple-300": "oklch(0.827 0.119 306.383)", "purple-600": "oklch(0.558 0.288 302.321)", "purple-700": "oklch(0.496 0.265 301.924)", "purple-900": "oklch(0.381 0.176 304.987)",
    "fuchsia-300": "oklch(0.833 0.145 321.434)", "fuchsia-600": "oklch(0.591 0.293 322.896)", "fuchsia-700": "oklch(0.518 0.253 323.949)",
    "pink-300": "oklch(0.823 0.12 346.018)", "pink-600": "oklch(0.592 0.249 0.584)", "pink-700": "oklch(0.525 0.223 3.958)", "pink-900": "oklch(0.408 0.153 2.432)",
    "rose-300": "oklch(0.81 0.117 11.638)", "rose-500": "oklch(0.645 0.246 16.439)", "rose-600": "oklch(0.586 0.253 17.585)", "rose-700": "oklch(0.514 0.222 16.935)", "rose-800": "oklch(0.455 0.188 13.697)", "rose-950": "oklch(0.271 0.105 12.094)",
    "slate-300": "oklch(0.869 0.022 252.894)", "slate-600": "oklch(0.446 0.043 257.281)", "slate-700": "oklch(0.372 0.044 257.287)", "slate-900": "oklch(0.208 0.042 265.755)",
    "gray-300": "oklch(0.872 0.01 258.338)", "gray-600": "oklch(0.446 0.03 256.802)", "gray-700": "oklch(0.373 0.034 259.733)",
    "zinc-300": "oklch(0.871 0.006 286.286)", "zinc-600": "oklch(0.442 0.017 285.786)", "zinc-700": "oklch(0.37 0.013 285.805)", "zinc-900": "oklch(0.21 0.006 285.885)",
    "neutral-300": "oklch(0.87 0 0)", "neutral-600": "oklch(0.439 0 0)", "neutral-700": "oklch(0.371 0 0)",
    "stone-300": "oklch(0.869 0.005 56.366)", "stone-600": "oklch(0.444 0.011 73.639)", "stone-700": "oklch(0.374 0.01 67.558)",
  ]

  static func theme(_ key: String, _ name: String, bg: String, border: String, text: String) -> ColorTheme {
    ColorTheme(key: key, name: name, background: tw[bg]!, border: tw[border]!, accentText: tw[text]!)
  }

  /// Picker order (`COLORS`): 5 rows × 6.
  public static let all: [ColorTheme] = [
    theme("default", "Default", bg: "zinc-700", border: "zinc-600", text: "zinc-300"),
    theme("slate", "Slate", bg: "slate-700", border: "slate-600", text: "slate-300"),
    theme("blue", "Blue", bg: "blue-700", border: "blue-600", text: "blue-300"),
    theme("sky", "Sky", bg: "sky-700", border: "sky-600", text: "sky-300"),
    theme("cyan", "Cyan", bg: "cyan-700", border: "cyan-600", text: "cyan-300"),
    theme("teal", "Teal", bg: "teal-700", border: "teal-600", text: "teal-300"),

    theme("indigo", "Indigo", bg: "indigo-700", border: "indigo-600", text: "indigo-300"),
    theme("purple", "Purple", bg: "purple-700", border: "purple-600", text: "purple-300"),
    theme("violet", "Violet", bg: "violet-700", border: "violet-600", text: "violet-300"),
    theme("pink", "Pink", bg: "pink-700", border: "pink-600", text: "pink-300"),
    theme("rose", "Rose", bg: "rose-700", border: "rose-600", text: "rose-300"),
    theme("red", "Red", bg: "red-700", border: "rose-500", text: "red-300"),

    theme("emerald", "Emerald", bg: "emerald-700", border: "emerald-600", text: "emerald-300"),
    theme("green", "Green", bg: "green-700", border: "emerald-500", text: "green-300"),
    theme("lime", "Lime", bg: "lime-700", border: "lime-600", text: "lime-300"),
    theme("yellow", "Yellow", bg: "yellow-700", border: "yellow-600", text: "yellow-300"),
    theme("amber", "Amber", bg: "amber-700", border: "amber-600", text: "amber-300"),
    theme("orange", "Orange", bg: "orange-700", border: "orange-600", text: "orange-300"),

    theme("stone", "Stone", bg: "stone-700", border: "stone-600", text: "stone-300"),
    theme("neutral", "Neutral", bg: "neutral-700", border: "neutral-600", text: "neutral-300"),
    theme("gray", "Gray", bg: "gray-700", border: "gray-600", text: "gray-300"),
    theme("charcoal", "Charcoal", bg: "zinc-900", border: "zinc-700", text: "zinc-300"),
    theme("ink", "Ink", bg: "slate-900", border: "slate-700", text: "slate-300"),
    theme("navy", "Navy", bg: "blue-950", border: "blue-900", text: "blue-300"),

    theme("fuchsia", "Fuchsia", bg: "fuchsia-700", border: "fuchsia-600", text: "fuchsia-300"),
    theme("plum", "Plum", bg: "purple-900", border: "purple-700", text: "purple-300"),
    theme("berry", "Berry", bg: "pink-900", border: "pink-700", text: "pink-300"),
    theme("wine", "Wine", bg: "rose-950", border: "rose-800", text: "rose-300"),
    theme("crimson", "Crimson", bg: "red-900", border: "red-800", text: "red-300"),
    theme("rust", "Rust", bg: "orange-900", border: "orange-800", text: "orange-300"),
  ]

  /// Legacy key mapped to the neutral ramp.
  static let legacy: [String: ColorTheme] = [
    "midnight": theme("midnight", "Midnight", bg: "slate-900", border: "slate-700", text: "slate-300"),
  ]

  public static let defaultKey = "default"

  /// `COLOR_THEMES[color] || COLOR_THEMES.default`
  public static func resolve(_ key: String?) -> ColorTheme {
    guard let key, !key.isEmpty else { return all[0] }
    return all.first { $0.key == key } ?? legacy[key] ?? all[0]
  }
}
