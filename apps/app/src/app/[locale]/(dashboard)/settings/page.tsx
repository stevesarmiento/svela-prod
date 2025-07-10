'use client';

import { MemorySettings, ProfileCard } from './_components';
import { ScrollArea } from '@v1/ui/scroll-area';

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
                  <h1 className="text-2xl font-bold text-white mb-2">Memory &amp; Data Settings</h1>
                  <p className="text-zinc-400 text-sm">
                    Each chat session is stored in memory for better context and performance, <br />you have control over that data and can export it or clear it as needed.
                  </p>
                </div>

                {/* Memory Settings */}
                <MemorySettings />
              
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}