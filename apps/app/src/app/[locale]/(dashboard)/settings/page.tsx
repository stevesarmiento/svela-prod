'use client';

import { MemorySettings } from './_components';

export default function SettingsPage() {
  return (
    <div className="space-y-8 p-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your memory preferences and AI settings
        </p>
      </div>

      <div className="grid gap-6">
        <MemorySettings />
        
        {/* Future settings components can be easily added here:
        <AppearanceSettings />
        <PrivacySettings />
        <NotificationSettings />
        <AccountSettings />
        */}
      </div>
    </div>
  );
}