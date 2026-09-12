// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "AggrCore",
  platforms: [.iOS(.v26), .macOS(.v15)],
  products: [
    .library(name: "AggrCore", targets: ["AggrCore"]),
  ],
  targets: [
    .target(
      name: "AggrCore",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "AggrCoreTests",
      dependencies: ["AggrCore"],
      resources: [.process("Fixtures")],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
  ]
)
