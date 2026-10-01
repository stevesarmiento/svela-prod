// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "Torph",
  platforms: [.iOS(.v26), .macOS(.v15)],
  products: [
    .library(name: "Torph", targets: ["Torph"]),
  ],
  targets: [
    .target(
      name: "Torph",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "TorphTests",
      dependencies: ["Torph"],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
  ]
)
