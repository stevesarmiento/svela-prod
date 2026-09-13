import AggrAPI
import ClerkKit
import SwiftUI

/// The Clerk avatar fills the entire glass settings trigger.
struct SettingsProfileButton: View {
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    let user = env.clerkSession.user
    Button { env.router.sheet = .settings } label: {
      AsyncImage(url: user.flatMap { URL(string: $0.imageUrl) }) { phase in
        if let image = phase.image {
          image.resizable().scaledToFill()
        } else {
          ZStack {
            Circle().fill(.quaternary)
            Text(ProfileCardView.initials(
              name: [user?.firstName, user?.lastName].compactMap { $0 }.joined(separator: " "),
              email: user?.primaryEmailAddress?.emailAddress))
              .font(.system(.headline, design: .rounded))
          }
        }
      }
      .frame(width: 44, height: 44)
      .clipShape(Circle())
    }
    .buttonStyle(.plain)
    .glassEffect(.regular.interactive(), in: .circle)
    .accessibilityLabel("Settings")
    .accessibilityIdentifier("settings-profile")
  }
}

#if DEBUG
#Preview("Settings avatar") {
  PreviewHost { _ in SettingsProfileButton() }
}
#endif
