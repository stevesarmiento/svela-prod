import AggrAPI
import AggrCore
import ClerkKit
import ClerkKitUI
import SwiftUI

/// Account actions plus device-specific appearance settings.
struct SettingsView: View {
  private enum Destination: Hashable { case account, appIcon }
  @Environment(AppEnvironment.self) private var env
  @Environment(\.dismiss) private var dismiss
  @State private var path = NavigationPath()
  @State private var isSigningOut = false
  @State private var signOutError: String?

  var body: some View {
    NavigationStack(path: $path) {
      List {
        Section { ProfileCardView(user: env.clerkSession.user) }
          .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)

        Section("Appearance") {
          NavigationLink(value: Destination.appIcon) {
            Label("App Icon", systemImage: "app.dashed")
          }
          .accessibilityIdentifier("settings-app-icon")
        }

        Section {
          NavigationLink(value: Destination.account) {
            Label("Manage account", systemImage: "person.text.rectangle")
          }
          .disabled(env.clerkSession.user == nil)
        } header: { Text("Account") } footer: {
          Text("Manage your profile, email, connected accounts and available security options.")
        }

        Section {
          Button(role: .destructive) { Task { await signOut() } } label: {
            HStack {
              Text("Sign out")
              Spacer()
              if isSigningOut { ProgressView() }
            }
          }
          .disabled(isSigningOut || env.clerkSession.user == nil)
        } footer: {
          if let signOutError { Text(signOutError).foregroundStyle(.red) }
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .navigationDestination(for: Destination.self) { destination in
        switch destination {
        case .appIcon:
          AppIconPickerView()
        case .account:
        // Share the parent path so Clerk's profile/security pages have a working back stack.
        // Clerk gates passkeys, MFA, sessions and deletion on actual account capabilities.
        #if DEBUG
        if env.convex.isPreview {
          ContentUnavailableView("Account preview", systemImage: "person.crop.circle", description: Text("Clerk account management requires a signed-in app session."))
        } else {
          accountView
        }
        #else
        accountView
        #endif
        }
      }
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
    }
    .presentationDetents([.large])
  }

  private var accountView: some View {
    UserProfileView(isDismissible: false, navigationPath: $path)
      .environment(Clerk.shared)
  }

  private func signOut() async {
    guard !isSigningOut else { return }
    isSigningOut = true
    signOutError = nil
    defer { isSigningOut = false }
    if await env.signOut() {
      dismiss()
    } else {
      signOutError = env.clerkSession.lastError ?? "Couldn't sign out. Try again."
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
          Text(Self.memberId(seed: user?.id ?? "anonymous")).font(.system(.caption2, design: .rounded).monospacedDigit())
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

#if DEBUG
#Preview("Settings") {
  PreviewHost(navigation: false) { _ in SettingsView() }
}
#Preview("Profile card") {
  ProfileCardView(user: PreviewData.user).preferredColorScheme(.dark)
}
#Preview("Profile without account") {
  ProfileCardView(user: nil).preferredColorScheme(.dark)
}
#endif
