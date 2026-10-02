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

  /// Decoded bitmaps budgeted by bytes, not just count: 600 logo thumbnails are ~60 MB uncompressed.
  nonisolated static let memoryBudget = 48 * 1024 * 1024
  /// `failed` is pruned of expired entries once it grows past this, so it cannot grow unbounded.
  nonisolated static let failedSoftLimit = 500

  private struct Loaded: Sendable {
    var image: UIImage?
    /// The image came from the on-disk thumbnail rather than the loader.
    var fromThumbnail = false
  }

  private let cache = NSCache<NSString, UIImage>()
  private var inflight: [Key: Task<Loaded, Never>] = [:]
  private var failed: [Key: Date] = [:]
  /// Keys known to have no fresh thumbnail on disk, so a row that scrolls in and out again never
  /// repeats the file stat. Cleared for a key when its thumbnail is written.
  private var missingThumbnails: Set<Key> = []
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
    cache.totalCostLimit = Self.memoryBudget
    if let thumbnailDirectory {
      try? FileManager.default.createDirectory(at: thumbnailDirectory, withIntermediateDirectories: true)
    }
  }

  /// The decoded image if it is in memory. Memory only, so a body evaluation can peek at every
  /// candidate URL for free; the on-disk thumbnail is read by `image(for:)`, off the main thread.
  func cachedImage(for url: URL, variant: Variant = .logo) -> UIImage? {
    cache.object(forKey: Key(url: url, variant: variant).cacheKey)
  }

  func image(for url: URL, variant: Variant = .logo) async -> UIImage? {
    let key = Key(url: url, variant: variant)
    if let cached = cache.object(forKey: key.cacheKey) { return cached }
    if let task = inflight[key] { return await task.value.image }
    if let failedAt = failed[key], now() < failedAt.addingTimeInterval(Self.failureBackoff) { return nil }

    let loader = self.loader
    let thumbnailFile = thumbnailFile(key)
    let readsThumbnail = thumbnailFile != nil && !missingThumbnails.contains(key)
    let freshAfter = now().addingTimeInterval(-Self.thumbnailLifetime)
    // Detached on purpose: an unstructured `Task` here would inherit the main actor and decode
    // on the main thread at first draw. The thumbnail is checked first in the same job, so an
    // icon seen on a previous launch paints without the network, and is written in it after a
    // download, before the image is handed back, so it is on disk by the time the icon shows.
    let task = Task.detached(priority: .utility) { () -> Loaded in
      if readsThumbnail, let thumbnailFile, let image = Self.readThumbnail(at: thumbnailFile, freshAfter: freshAfter) {
        return Loaded(image: image, fromThumbnail: true)
      }
      guard let data = try? await loader(url), let image = Self.decode(data, variant: variant) else { return Loaded() }
      if let thumbnailFile, let png = image.pngData() {
        try? png.write(to: thumbnailFile, options: .atomic)
      }
      return Loaded(image: image)
    }
    inflight[key] = task
    let loaded = await task.value
    inflight[key] = nil
    #if DEBUG
    if !loaded.fromThumbnail { loadCount += 1 }
    #endif
    if let image = loaded.image {
      cache.setObject(image, forKey: key.cacheKey, cost: Self.cost(of: image))
      failed[key] = nil
      // Either it was just read from disk or just written there.
      missingThumbnails.remove(key)
    } else {
      if readsThumbnail { missingThumbnails.insert(key) }
      failed[key] = now()
      pruneFailedIfNeeded()
    }
    if missingThumbnails.count > 2_000 { missingThumbnails.removeAll(keepingCapacity: true) }
    return loaded.image
  }

  func store(_ image: UIImage, for url: URL, variant: Variant = .logo) {
    cache.setObject(image, forKey: Key(url: url, variant: variant).cacheKey, cost: Self.cost(of: image))
  }

  /// Bytes the decoded bitmap occupies, for the cache's memory budget.
  nonisolated static func cost(of image: UIImage) -> Int {
    if let cgImage = image.cgImage { return cgImage.bytesPerRow * cgImage.height }
    let pixels = image.size.width * image.scale * image.size.height * image.scale
    return Int(pixels) * 4
  }

  /// Drops failures whose backoff has passed once the table is large; the rest still gate retries.
  private func pruneFailedIfNeeded() {
    guard failed.count > Self.failedSoftLimit else { return }
    let cutoff = now().addingTimeInterval(-Self.failureBackoff)
    failed = failed.filter { $0.value > cutoff }
  }

  // MARK: Thumbnails on disk

  private func thumbnailFile(_ key: Key) -> URL? {
    guard key.variant == .logo, let thumbnailDirectory else { return nil }
    let digest = SHA256.hash(data: Data((key.cacheKey as String).utf8))
    let name = digest.map { String(format: "%02x", $0) }.joined()
    return thumbnailDirectory.appendingPathComponent(name).appendingPathExtension("png")
  }

  /// Runs on the loader's background job. Thumbnails are ~160 px PNGs, a sub-millisecond read.
  nonisolated static func readThumbnail(at file: URL, freshAfter: Date) -> UIImage? {
    guard let modified = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate,
          modified > freshAfter,
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
      // Memory hits resolve without a suspension; disk thumbnails and downloads come back async.
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
