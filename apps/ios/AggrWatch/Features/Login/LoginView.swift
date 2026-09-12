import AggrAPI
import SwiftUI

/// Mirrors `apps/app/src/components/login-methods.tsx` (Google branch only; Solana is web-only).
struct LoginView: View {
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()
      VStack(spacing: 28) {
        Spacer()
        VStack(spacing: 10) {
          (Text("aggr") + Text(".").foregroundStyle(.tint.opacity(0.6)) + Text("watch"))
            .font(.system(size: 40, weight: .semibold, design: .rounded))
          Text("Focused crypto market intelligence for watchlists, screening, and clearer decisions.")
            .font(.callout)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
        }
        Spacer()
        VStack(spacing: 12) {
          Button {
            Task { await env.clerkSession.signInWithGoogle() }
          } label: {
            HStack(spacing: 10) {
              Image(systemName: "g.circle.fill")
              Text(env.clerkSession.isSigningIn ? "Connecting…" : "Connect with Google")
                .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
          }
          .buttonStyle(.glassProminent)
          .disabled(env.clerkSession.isSigningIn)

          if let error = env.clerkSession.lastError {
            Text(error)
              .font(.footnote)
              .foregroundStyle(.red)
              .multilineTextAlignment(.center)
          }
        }
        .padding(20)
        .glassEffect(.regular, in: .rect(cornerRadius: 24))
        .padding(.horizontal, 24)
        .padding(.bottom, 32)
      }
    }
  }
}
