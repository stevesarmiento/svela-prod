import Foundation
import Testing
import UIKit
@testable import AggrWatch

@Test @MainActor func appIconsAreBundledForIPhoneAndIPad() throws {
  // Read the built plist directly; Bundle's infoDictionary resolves device-qualified keys.
  let data = try Data(contentsOf: Bundle.main.bundleURL.appendingPathComponent("Info.plist"))
  let info = try #require(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
  for key in ["CFBundleIcons", "CFBundleIcons~ipad"] {
    let icons = try #require(info[key] as? [String: Any])
    let primary = try #require(icons["CFBundlePrimaryIcon"] as? [String: Any])
    #expect(primary["CFBundleIconName"] as? String == AppIconOption.primary.rawValue)
    let alternates = try #require(icons["CFBundleAlternateIcons"] as? [String: Any])
    #expect(Set(alternates.keys) == Set(AppIconOption.allCases.compactMap(\.alternateName)))
  }
  for option in AppIconOption.allCases {
    #expect(UIImage(named: option.previewName) != nil)
  }
}
