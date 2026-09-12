import AggrAPI
import AggrCore
import ClerkKit
import ClerkKitUI
import SwiftUI

/// Port of `/settings`: profile card, Clerk account management (ClerkKitUI prebuilt profile),
/// preferences persisted through `userSettings:upsertMyUserSettings`, sign out and delete.
struct SettingsView: View {
  @Environment(AppEnvironment.self) private var env
  @Environment(\.dismiss) private var dismiss
  @State private var settings: UserSettings?
  @State private var settingsError: String?
  @State private var showDeleteConfirm = false
  @State private var isDeleting = false

  var body: some View {
    NavigationStack {
      List {
        Section { ProfileCardView(user: env.clerkSession.user) }
          .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)

        Section("Account") {
          NavigationLink { UserProfileView(isDismissible: false).environment(Clerk.shared) } label: {
            Label("Profile, email & security", systemImage: "person.text.rectangle")
          }
          if let u = env.clerkSession.user {
            LabeledContent("Connected accounts", value: u.verifiedExternalAccounts.map { $0.provider.capitalized }.joined(separator: ", ").ifEmpty("None"))
            LabeledContent("Passkeys", value: "\(u.passkeys.count)")
          }
        }

        Section {
          if let s = settings {
            toggle("Email notifications", key: "emailNotifications", value: s.emailNotifications)
            toggle("Push notifications", key: "pushNotifications", value: s.pushNotifications)
            toggle("Price alerts", key: "priceAlerts", value: s.priceAlerts)
          } else { preferencesPlaceholder }
        } header: { Text("Notification preferences") } footer: {
          Text("Saved to your account. Push notifications and price alerts are not yet delivered to this iOS app.")
        }

        Section {
          if let s = settings {
            toggle("Remember analysis context", key: "memoryEnabled", value: s.memoryEnabled)
            toggle("Analytics", key: "analyticsEnabled", value: s.analyticsEnabled)
            toggle("Share usage data", key: "shareUsageData", value: s.shareUsageData)
          } else { preferencesPlaceholder }
        } header: { Text("Privacy") } footer: {
          if let settingsError { Text(settingsError).foregroundStyle(.red) }
        }

        Section {
          Button("Sign out", role: .destructive) { Task { if await env.signOut() { dismiss() } } }
        }

        Section {
          Button(role: .destructive) { showDeleteConfirm = true } label: {
            HStack { Text("Delete account"); if isDeleting { Spacer(); ProgressView() } }
          }
          .disabled(isDeleting || !(env.clerkSession.user?.deleteSelfEnabled ?? false))
        } header: { Text("Danger zone") } footer: {
          Text("Permanently deletes your aggr.watch account and watchlists.")
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
      .confirmationDialog("Delete your account?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
        Button("Delete account", role: .destructive) { Task { await deleteAccount() } }
      } message: { Text("This cannot be undone.") }
    }
    .presentationDetents([.large])
    .task(id: env.isReadyForUserData) {
      guard env.isReadyForUserData else { return }
      do {
        for try await s in env.settings.settings() { settings = s }
      } catch { if !Task.isCancelled { settingsError = error.localizedDescription } }
    }
  }

  private var preferencesPlaceholder: some View {
    HStack { SkeletonBlock(height: 14, width: 180); Spacer() }
  }

  private func toggle(_ title: String, key: String, value: Bool) -> some View {
    Toggle(title, isOn: Binding(get: { settings.map { current(key, $0) } ?? value }, set: { new in
      guard var s = settings else { return }
      apply(key, new, to: &s)
      settings = s
      Task {
        do { try await env.settings.update([key: new]); settingsError = nil }
        catch { settingsError = error.localizedDescription }
      }
    }))
  }

  private func current(_ key: String, _ s: UserSettings) -> Bool {
    switch key {
    case "emailNotifications": s.emailNotifications
    case "pushNotifications": s.pushNotifications
    case "priceAlerts": s.priceAlerts
    case "memoryEnabled": s.memoryEnabled
    case "analyticsEnabled": s.analyticsEnabled
    default: s.shareUsageData
    }
  }

  private func apply(_ key: String, _ v: Bool, to s: inout UserSettings) {
    switch key {
    case "emailNotifications": s.emailNotifications = v
    case "pushNotifications": s.pushNotifications = v
    case "priceAlerts": s.priceAlerts = v
    case "memoryEnabled": s.memoryEnabled = v
    case "analyticsEnabled": s.analyticsEnabled = v
    default: s.shareUsageData = v
    }
  }

  private func deleteAccount() async {
    guard let user = env.clerkSession.user else { return }
    isDeleting = true
    defer { isDeleting = false }
    do {
      _ = try await user.delete()
      await env.signOut()
      dismiss()
    } catch {
      env.toasts.error("Couldn't delete account", error.localizedDescription)
    }
  }
}

/// Port of `profile-card.tsx`: avatar, display name, email, member id and issue date.
struct ProfileCardView: View {
  let user: User?

  var body: some View {
    let email = user?.primaryEmailAddress?.emailAddress
    let name = UserDisplay.displayName(fullName: user.flatMap { [$0.firstName, $0.lastName].compactMap { $0 }.joined(separator: " ").ifEmpty(nil) }, email: email, walletAddress: nil)
    HStack(spacing: 14) {
      AsyncImage(url: user.flatMap { URL(string: $0.imageUrl) }) { img in img.resizable().scaledToFill() } placeholder: {
        Text(Self.initials(name: name, email: email)).font(.headline).frame(maxWidth: .infinity, maxHeight: .infinity).background(.white.opacity(0.08))
      }
      .frame(width: 56, height: 56).clipShape(.circle)
      VStack(alignment: .leading, spacing: 3) {
        Text(name).font(.headline)
        if let email { Text(email).font(.caption).foregroundStyle(.secondary) }
        HStack(spacing: 8) {
          Text(Self.memberId(seed: user?.id ?? "anonymous")).font(.system(.caption2, design: .monospaced))
          if let d = user?.createdAt { Text("Issued \(d.formatted(.dateTime.month(.abbreviated).day(.twoDigits).year()))").font(.caption2).foregroundStyle(.secondary) }
        }
      }
      Spacer()
    }
    .padding(16)
    .glassEffect(.regular, in: .rect(cornerRadius: 20))
    .padding(.horizontal, 16)
  }

  static func initials(name: String, email: String?) -> String {
    let seed = name.isEmpty ? (email?.split(separator: "@").first.map(String.init) ?? "") : name
    let parts = seed.split(whereSeparator: { " ._-".contains($0) })
    let letters = parts.count > 1 ? parts.prefix(2).compactMap { $0.first.map { String($0).uppercased() } }.joined() : String(seed.prefix(2)).uppercased()
    return letters.isEmpty ? "SV" : letters
  }

  /// `getMemberId`: FNV-1a 32 → base36 upper, 6 chars.
  static func memberId(seed: String) -> String {
    var hash: UInt32 = 0x811c9dc5
    for b in seed.utf8 { hash ^= UInt32(b); hash = hash &* 0x01000193 }
    let serial = String(hash, radix: 36).uppercased()
    return "SVL-" + String(serial.padding(toLength: max(6, serial.count), withPad: "0", startingAt: 0).prefix(6))
  }
}

private extension String {
  func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
  func ifEmpty(_ fallback: String?) -> String? { isEmpty ? fallback : self }
}
