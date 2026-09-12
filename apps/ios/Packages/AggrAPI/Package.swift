// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "AggrAPI",
  platforms: [.iOS(.v26), .macOS(.v15)],
  products: [
    .library(name: "AggrAPI", targets: ["AggrAPI"]),
  ],
  dependencies: [
    .package(path: "../AggrCore"),
    .package(url: "https://github.com/get-convex/convex-swift", exact: "0.8.1"),
    .package(url: "https://github.com/clerk/clerk-ios", exact: "1.5.4"),
  ],
  targets: [
    .target(
      name: "AggrAPI",
      dependencies: [
        .product(name: "AggrCore", package: "AggrCore"),
        .product(name: "ConvexMobile", package: "convex-swift"),
        .product(name: "ClerkKit", package: "clerk-ios"),
      ],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "AggrAPITests",
      dependencies: ["AggrAPI"],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
  ]
)
