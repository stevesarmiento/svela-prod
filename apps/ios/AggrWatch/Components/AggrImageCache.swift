import CryptoKit
import ImageIO
import SwiftUI
import UIKit

/// Process-wide decoded image cache shared by `TokenLogo` and avatar views.
///
/// Downloads and decodes off the main thread, downsamples logos to the size they are drawn at, and
/// keeps the bytes on disk through a dedicated `URLCache` so a relaunch paints logos without the
/// network. The facade stays main-actor so call sites can peek synchronously before the first frame.
///
/// Decoded logo thumbnails are also kept on disk under the URL that was asked for. The URLCache
/// alone misses on redirecting logo URLs: it stores the final response under the redirect target,
/// so every launch paid a network round trip before the icon appeared.
@MainActor
final class AggrImageCache {
  /// How the bytes are decoded. Logos are drawn at 20–56 pt, so a 160 px bitmap is crisp at 3x
  /// and a fraction of the memory of the source artwork.
  enum Variant: Hashable, Sendable {
    case logo
    case full
  }

  typealias Loader = @Sendable (URL) async throws -> Data

  static let shared = AggrImageCache(thumbnailDirectory: FileManager.default
    .urls(for: .cachesDirectory, in: .userDomainMask).first?
    .appendingPathComponent("aggr-image-thumbs", isDirectory: true))
  nonisolated static let logoMaxPixelSize = 160
  /// A URL that failed is not retried while rows scroll in and out; the next launch tries again.
  nonisolated static let failureBackoff: TimeInterval = 60
  /// Thumbnails older than this are refetched; logos rarely change, but they can.
  nonisolated static let thumbnailLifetime: TimeInterval = 14 * 24 * 60 * 60

  private struct Key: Hashable, Sendable {
    let url: URL
    let variant: Variant

    var cacheKey: NSString { "\(variant)|\(url.absoluteString)" as NSString }
  }

  private let cache = NSCache<NSString, UIImage>()
  private var inflight: [Key: Task<UIImage?, Never>] = [:]
  private var failed: [Key: Date] = [:]
  private let loader: Loader
  private let now: () -> Date
  /// Where decoded logo thumbnails persist across launches; nil keeps them in memory only (tests).
  private let thumbnailDirectory: URL?
  #if DEBUG
  /// How many loads actually reached the loader; lets tests prove dedupe and backoff.
  private(set) var loadCount = 0
  #endif

  init(
    loader: @escaping Loader = AggrImageCache.diskCachedLoader(),
    now: @escaping () -> Date = Date.init,
    thumbnailDirectory: URL? = nil
  ) {
    self.loader = loader
    self.now = now
    self.thumbnailDirectory = thumbnailDirectory
    cache.countLimit = 600
    if let thumbnailDirectory {
      try? FileManager.default.createDirectory(at: thumbnailDirectory, withIntermediateDirectories: true)
    }
  }

  /// Memory first, then the on-disk thumbnail, so an icon seen on a previous launch paints in
  /// the first frame. Thumbnails are ~160 px PNGs, a sub-millisecond read.
  func cachedImage(for url: URL, variant: Variant = .logo) -> UIImage? {
    let key = Key(url: url, variant: variant)
    if let cached = cache.object(forKey: key.cacheKey) { return cached }
    guard let image = readThumbnail(key) else { return nil }
    cache.setObject(image, forKey: key.cacheKey)
    return image
  }

  func image(for url: URL, variant: Variant = .logo) async -> UIImage? {
    let key = Key(url: url, variant: variant)
    if let cached = cachedImage(for: url, variant: variant) { return cached }
    if let task = inflight[key] { return await task.value }
    if let failedAt = failed[key], now() < failedAt.addingTimeInterval(Self.failureBackoff) { return nil }

    let loader = self.loader
    let thumbnailFile = thumbnailFile(key)
    #if DEBUG
    loadCount += 1
    #endif
    // Detached on purpose: an unstructured `Task` here would inherit the main actor and decode
    // on the main thread at first draw. The thumbnail is written in the same job, before the
    // image is handed back, so it is on disk by the time the icon shows.
    let task = Task.detached(priority: .utility) { () -> UIImage? in
      guard let data = try? await loader(url), let image = Self.decode(data, variant: variant) else { return nil }
      if let thumbnailFile, let png = image.pngData() {
        try? png.write(to: thumbnailFile, options: .atomic)
      }
      return image
    }
    inflight[key] = task
    let image = await task.value
    inflight[key] = nil
    if let image {
      cache.setObject(image, forKey: key.cacheKey)
      failed[key] = nil
    } else {
      failed[key] = now()
    }
    return image
  }

  func store(_ image: UIImage, for url: URL, variant: Variant = .logo) {
    cache.setObject(image, forKey: Key(url: url, variant: variant).cacheKey)
  }

  // MARK: Thumbnails on disk

  private func thumbnailFile(_ key: Key) -> URL? {
    guard key.variant == .logo, let thumbnailDirectory else { return nil }
    let digest = SHA256.hash(data: Data((key.cacheKey as String).utf8))
    let name = digest.map { String(format: "%02x", $0) }.joined()
    return thumbnailDirectory.appendingPathComponent(name).appendingPathExtension("png")
  }

  private func readThumbnail(_ key: Key) -> UIImage? {
    guard let file = thumbnailFile(key),
          let modified = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate,
          now().timeIntervalSince(modified) < Self.thumbnailLifetime,
          let data = try? Data(contentsOf: file) else { return nil }
    return UIImage(data: data, scale: 1)
  }

  // MARK: Decoding

  /// Decodes on the calling (background) thread. Logos go through ImageIO thumbnailing so the
  /// full-resolution bitmap is never materialized; `full` prepares for display at native size.
  nonisolated static func decode(_ data: Data, variant: Variant) -> UIImage? {
    switch variant {
    case .logo:
      guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
      let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: logoMaxPixelSize,
      ]
      if let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) {
        return UIImage(cgImage: thumbnail)
      }
      return UIImage(data: data)?.preparingForDisplay()
    case .full:
      guard let image = UIImage(data: data) else { return nil }
      return image.preparingForDisplay() ?? image
    }
  }

  // MARK: Transport

  /// A session whose cache lives on disk and is consulted before the network. Logo hosts are
  /// third-party CDNs and their URLs are stable per image, so a changed image under an unchanged
  /// URL only shows once the entry is evicted.
  nonisolated static func diskCachedLoader() -> Loader {
    let configuration = URLSessionConfiguration.default
    let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
      .appendingPathComponent("aggr-images", isDirectory: true)
    configuration.urlCache = URLCache(memoryCapacity: 0, diskCapacity: 100 * 1024 * 1024, directory: directory)
    configuration.requestCachePolicy = .returnCacheDataElseLoad
    configuration.timeoutIntervalForRequest = 20
    configuration.httpMaximumConnectionsPerHost = 6
    let session = URLSession(configuration: configuration)
    return { url in
      let (data, response) = try await session.data(from: url)
      if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
        throw URLError(.badServerResponse)
      }
      return data
    }
  }
}

/// Remote artwork on `AggrImageCache`: paints synchronously when the bytes are already decoded,
/// never blanks art that is showing when a reload fails.
struct CachedRemoteImage<Placeholder: View>: View {
  let url: URL?
  var variant: AggrImageCache.Variant = .full
  @ViewBuilder let placeholder: () -> Placeholder
  @State private var loaded: (url: URL, image: UIImage)?

  var body: some View {
    Group {
      if let image = displayedImage {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        placeholder()
      }
    }
    .task(id: url) {
      guard let url, loaded?.url != url else { return }
      if let cached = AggrImageCache.shared.cachedImage(for: url, variant: variant) {
        loaded = (url, cached)
        return
      }
      let image = await AggrImageCache.shared.image(for: url, variant: variant)
      guard !Task.isCancelled else { return }
      if let image { loaded = (url, image) }
    }
  }

  private var displayedImage: UIImage? {
    guard let url else { return nil }
    if let loaded, loaded.url == url { return loaded.image }
    return AggrImageCache.shared.cachedImage(for: url, variant: variant) ?? loaded?.image
  }
}
