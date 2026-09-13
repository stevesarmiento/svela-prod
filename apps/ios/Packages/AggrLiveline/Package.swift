// swift-tools-version: 6.2
import PackageDescription
let package = Package(
  name: "AggrLiveline",
  platforms: [.iOS(.v26), .macOS(.v15)],
  products: [.library(name: "AggrLiveline", targets: ["AggrLiveline"])],
  targets: [
    .target(name: "AggrLiveline", resources: [.process("Resources")]),
    .testTarget(name: "AggrLivelineTests", dependencies: ["AggrLiveline"], resources: [.process("Fixtures")])
  ]
)
