# Torph

A text-morph engine: rolls digits by place value and slides words when a string changes.

## Provenance

- Upstream: [lochie/torph](https://github.com/lochie/torph) (MIT, © 2025 Lochie Axon — license
  notice lives in the `Torph.swift` header). The engine (segmentation, place-value number matching,
  word diff) is a 1:1 Swift port of the TypeScript library; the SwiftUI renderer is new.
- Ported verbatim from the OpenKeep repo (`/Users/stevensarmi/Code/native`, `Sources/Torph` +
  `Tests/TorphTests`) at commit `cba0ae54a348cf1a14f2ee3ba25915fce5c3169a` (2026-09-30).

## Local changes

- `Engine/NumberSegmenter.swift`: `IDMinter.next` marked `nonisolated(unsafe)` (the adjacent
  `NSLock` guards every access) so the package builds in Swift 6 language mode.

Keep this package a verbatim mirror where possible — future fixes sync as a plain diff against the
OpenKeep tree.
