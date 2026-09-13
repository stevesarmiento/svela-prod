# iOS settings functionality audit

Reviewed September 12, 2026 against the current web settings, Convex functions, native app, and pinned Clerk iOS SDK source. This is source-level verification; live account changes and account deletion were not exercised.

## Findings and changes

The web settings page renders a profile card and account/authentication management. It does not render the six notification/privacy toggles that the native screen had added. Their fields exist in the Convex schema and can be saved, but searches of application and package sources found no consumers that use those values to enable or disable the advertised features. Persistence alone did not make these functional settings.

| Before | After | Why |
| --- | --- | --- |
| Email notifications, push notifications, price alerts | Removed from the iOS screen | No notification delivery behavior was found consuming these flags; native push registration/delivery is not implemented. |
| Remember analysis context | Removed from the iOS screen | The stored memory flag has no identified consumer in the app's analysis flows. |
| Analytics, Share usage data | Removed from the iOS screen | No instrumentation or consent handling was found consulting these flags. They could misleadingly imply control over actual telemetry. |
| Connected-account and passkey summaries on the root | Consolidated under Manage account | The summaries were real Clerk metadata, but duplicated account details and were not settings themselves. Passkeys are not rendered by the current web AccountSection. |
| Embedded Clerk view without a shared navigation path | Uses the settings NavigationPath | The pinned SDK explicitly supports this integration, avoiding nested navigation stacks for account/security destinations. |
| Custom delete action promising account and watchlist deletion | Uses Clerk's capability-gated Security → Delete account flow | The SDK supplies typed confirmation, error handling, and biometric credential cleanup. The custom promise of Convex watchlist deletion was unsupported by the reviewed code. |
| Sign-out with no local progress or error state | Prevents duplicate requests and displays progress/failure in the settings screen | The existing session cleanup remains intact, and a failure is visible inside the sheet. |

The profile card is retained. Its name, email, image, and join date derive from the signed-in user; its member identifier is decorative and derived from the user ID, matching the web card.

## Working account controls

Manage account uses Clerk's actual profile, email, connected-account, security, and device/session flows. The SDK calls backend operations such as `user.update`, `user.setProfileImage`, `user.createPasskey`, `user.getSessions`, and `user.delete`. Password, passkey, MFA, biometric, and deletion controls depend on Clerk's runtime capabilities rather than static placeholder switches. Sign-out calls the existing app session service and cleanup path.

No stored user preferences or backend schema fields were deleted. The cleanup removes misleading controls and their now-unnecessary subscription from the iOS settings screen. It does not disable telemetry or change account notification preferences.

## Remaining gap

Clerk account deletion is a real operation. A complete deletion of associated Convex watchlists/settings was not verified: no account-deletion webhook or coordinated purge was found in the reviewed repository. An externally configured integration may exist, but this audit cannot establish it. The web deletion copy also promises associated-data deletion and needs that backend behavior verified before the promise is relied upon.

## Source references

- [Web settings page](/Users/stevensarmi/Code/svela-prod/apps/app/src/app/[locale]/(dashboard)/settings/page.tsx)
- [Web account sections](/Users/stevensarmi/Code/svela-prod/apps/app/src/app/[locale]/(dashboard)/settings/_components/account/account-section.tsx)
- [Web deletion implementation](/Users/stevensarmi/Code/svela-prod/apps/app/src/app/[locale]/(dashboard)/settings/_components/account/danger-zone.tsx)
- [Stored Convex flags](/Users/stevensarmi/Code/svela-prod/apps/app/convex/userSettings.ts)
- [iOS settings](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Settings/SettingsView.swift)
- [App sign-out and session cleanup](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/App/AppEnvironment.swift)
- [Clerk account UI and navigation](/Users/stevensarmi/Code/svela-prod/apps/ios/DerivedData/SourcePackages/checkouts/clerk-ios/Sources/ClerkKitUI/Components/UserProfile/UserProfileView.swift)
- [Clerk capability checks](/Users/stevensarmi/Code/svela-prod/apps/ios/DerivedData/SourcePackages/checkouts/clerk-ios/Sources/ClerkKitUI/Components/UserProfile/UserProfileSecurityView.swift)
- [Clerk deletion implementation](/Users/stevensarmi/Code/svela-prod/apps/ios/DerivedData/SourcePackages/checkouts/clerk-ios/Sources/ClerkKitUI/Components/UserProfile/UserProfileDeleteAccountConfirmationView.swift)
