"use client";

import { ScrollArea } from "@v1/ui/scroll-area";
import { AccountSection } from "./_components/account/account-section";
import { ProfileCard } from "./_components/profile-card";

export default function SettingsPage() {
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-12 gap-8">
          {/* Left Column - Fixed Profile Card */}
          <div className="col-span-4">
            <ProfileCard />
          </div>

          {/* Right Column - Scrollable Settings */}
          <div className="col-span-8">
            <ScrollArea className="h-full pr-4">
              <div className="space-y-6">
                {/* Header */}
                <div className="mb-8">
                  <h1 className="text-2xl font-bold dark:text-white text-zinc-950 mb-2">
                    Settings & Preferences
                  </h1>
                  <p className="text-zinc-700 dark:text-zinc-400 text-sm">
                    Manage your account and authentication methods.
                  </p>
                </div>

                {/* Account & Authentication */}
                <AccountSection />
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
