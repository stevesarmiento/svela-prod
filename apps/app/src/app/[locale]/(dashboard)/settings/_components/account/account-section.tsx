"use client";

import { useUser } from "@clerk/nextjs";
import { Separator } from "@v1/ui/separator";
import { useSyncExternalStore } from "react";
import { ActiveSessions } from "./active-sessions";
import { ConnectedAccounts } from "./connected-accounts";
import { DangerZone } from "./danger-zone";
import { EmailAddresses } from "./email-addresses";
import { ProfileInfo } from "./profile-info";
import { SectionCard } from "./section-card";

const emptySubscribe = () => () => {};

/**
 * Custom account & authentication management, replacing Clerk's prebuilt
 * `openUserProfile()` dialog. Built entirely on Clerk client hooks and
 * @v1/ui primitives.
 */
export function AccountSection() {
  const { user, isLoaded } = useUser();
  // Avoid SSR/hydration mismatch for user-dependent content without a
  // post-paint state update: server snapshot is false, client is true.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted || !isLoaded) {
    return (
      <div className="space-y-4">
        <SectionCard title="Account">
          <div className="text-xs text-muted-foreground">
            Loading account...
          </div>
        </SectionCard>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <SectionCard title="Account">
          <div className="text-xs text-muted-foreground">
            Sign in to manage your account.
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Profile & Email">
        <ProfileInfo />
        <Separator className="bg-primary/5 scale-125" />
        <EmailAddresses />
      </SectionCard>
      <SectionCard title="Connected Accounts & Devices">
        <ConnectedAccounts />
        <Separator className="bg-primary/5 scale-125" />
        <ActiveSessions />
      </SectionCard>
      <SectionCard title="Danger Zone">
        <DangerZone />
      </SectionCard>
    </div>
  );
}
