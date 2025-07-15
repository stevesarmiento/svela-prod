'use client';

import { useState, useEffect } from 'react';
import { Button } from '@v1/ui/button';
import { Switch } from '@v1/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@v1/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@v1/ui/dropdown-menu';
import { Separator } from '@v1/ui/separator';
import { IconTrash, IconGlobe, IconCursorarrowRays, IconEraserLineDashedFill, IconPoint3FilledConnectedTrianglepathDotted } from 'symbols-react';
import { useAuth } from '@v1/convex/hooks';
import { toast } from 'sonner';
import { bulkCleanupMemories } from '@/lib/client-memory-utils';
import { useUserSettings } from '@/hooks/use-user-settings';




export function MemorySettings() {
  const { user } = useAuth();
  const { updateMemory, getMemorySettings } = useUserSettings();
  const [isLoading, setIsLoading] = useState(false);
  
  // Use local state to avoid hydration mismatches
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState('30');

  // Load settings after hydration
  useEffect(() => {
    const settings = getMemorySettings();
    setMemoryEnabled(settings.memoryEnabled);
    setAutoCleanupEnabled(settings.autoCleanupEnabled);
    setRetentionDays(settings.retentionDays);
  }, [getMemorySettings]);



  // Handle memory toggle and retention changes
  const handleMemoryToggle = async (enabled: boolean) => {
    setMemoryEnabled(enabled); // Update local state immediately
    await updateMemory({ memoryEnabled: enabled });
    toast.success(`Memory ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleAutoCleanupToggle = async (enabled: boolean) => {
    setAutoCleanupEnabled(enabled); // Update local state immediately
    await updateMemory({ autoCleanupEnabled: enabled });
    toast.success(`Auto-cleanup ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleRetentionChange = async (days: string) => {
    setRetentionDays(days); // Update local state immediately
    await updateMemory({ retentionDays: days });
    toast.success(`Retention period updated to ${days === 'never' ? 'never delete' : `${days} days`}`);
  };

  const handleClearOldMemories = async (days: number) => {
    if (!user?.id) {
      toast.error('Please sign in to manage memories');
      return;
    }

    setIsLoading(true);
    try {
      // Use client-safe API for better control
      const result = await bulkCleanupMemories(user.id, { olderThanDays: days });
      
      if (result.success) {
        toast.success(`Cleared ${result.count} old memories (${days}+ days)`);
      } else {
        toast.error('Failed to clear memories');
      }
    } catch (error) {
      console.error('Memory cleanup error:', error);
      toast.error('Failed to clear memories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAllMemories = async () => {
    if (!user?.id) {
      toast.error('Please sign in to manage memories');
      return;
    }

    if (!confirm('Are you sure you want to clear all memories? This action cannot be undone.')) {
      return;
    }

    // Use client-safe API for better control
    setIsLoading(true);
    try {
      // Delete all memories older than 0 days (all memories)
      const result = await bulkCleanupMemories(user.id, { olderThanDays: 0 });
      
      if (result.success) {
        toast.success(`Cleared ${result.count} memories`);
      } else {
        toast.error('Failed to clear memories');
      }
    } catch (error) {
      console.error('Memory cleanup error:', error);
      toast.error('Failed to clear memories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearSessionMemories = async () => {
    if (!user?.id) {
      toast.error('Please sign in to manage memories');
      return;
    }

    if (!confirm('Clear all memories from current and recent chat sessions?')) {
      return;
    }

    setIsLoading(true);
    try {
      // Clear memories from chat sessions (using metadata filter)
      const result = await bulkCleanupMemories(user.id, { 
        metadataFilter: { source: 'chat_query' } 
      });
      
      // Also clear chat responses
      const result2 = await bulkCleanupMemories(user.id, { 
        metadataFilter: { source: 'chat_response' } 
      });
      
      const totalCleared = result.count + result2.count;
      
      if (result.success && result2.success) {
        toast.success(`Cleared ${totalCleared} session memories`);
      } else {
        toast.error('Failed to clear session memories');
      }
    } catch (error) {
      console.error('Session cleanup error:', error);
      toast.error('Failed to clear session memories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportMemories = async () => {
    if (!user?.id) {
      toast.error('Please sign in to export memories');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/memory/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });

      if (response.ok) {
        // Create download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `memories-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast.success('Memories exported successfully!');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to export memories');
      }
    } catch (error) {
      toast.error('Failed to export memories');
      console.error('Export error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Memory System Card */}
      <div className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
        {/* Header */}
        <div className="px-3 py-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="flex items-center gap-2">
              <span>Chat Memory & Configuration</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Memory Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1">
                  <IconPoint3FilledConnectedTrianglepathDotted className="h-5 w-5 dark:fill-white/50 fill-zinc-950/50" />
                </div>
                <div className="">
                  <div className="font-bold text-xs">Enable Memory</div>
                  <div className="text-primary/40 text-xs">
                    Allow AI to remember your conversations for better context around new queries or questions.
                  </div>
                </div>                
              </div>

              <Switch
                id="memory-enabled"
                checked={memoryEnabled}
                onCheckedChange={handleMemoryToggle}
              />
            </div>

            <Separator className="bg-primary/5 scale-125" />

            {/* Auto-cleanup Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1">
                  <IconEraserLineDashedFill className="h-5 w-5 dark:fill-white/50 fill-zinc-950/50" />
                </div>
                <div className="">
                  <div className="font-bold text-xs">Auto-cleanup Chat Sessions</div>
                  <div className="text-primary/40 text-xs">
                    Automatically delete memories when chat sessions ended so new chats can start fresh.
                  </div>
                </div>
              </div>
              <Switch
                id="auto-cleanup-enabled"
                checked={autoCleanupEnabled}
                onCheckedChange={handleAutoCleanupToggle}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Memory Retention & Management Card */}
      {memoryEnabled && (
        <div className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
          {/* Header */}
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Data Retention & Management
            </div>
          </div>

          {/* Content */}
          <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 space-y-4">
              {/* Auto-delete retention setting */}
              <div className="flex justify-between items-center">
                <div className="font-bold text-xs">Memory Actions & Retention Settings</div>
                <div className="flex items-center gap-2">
                <Select value={retentionDays} onValueChange={handleRetentionChange}>
                  <SelectTrigger className="w-40 h-8 text-xs rounded-lg hover:bg-black/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 rounded-xl z-[101]">
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                      className="h-8 space-x-2"
                    >
                      <span className="text-xs">Quick Actions</span>
                      <IconCursorarrowRays className="h-3 w-3 fill-white/50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-zinc-900 rounded-xl z-[101]">
                    <DropdownMenuItem onClick={() => handleClearOldMemories(7)}>
                      Clear 7+ Days Old
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleClearOldMemories(30)}>
                      Clear 30+ Days Old
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleClearSessionMemories}>
                      Clear Chat Sessions
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleExportMemories}>
                      <IconGlobe className="h-3 w-3 mr-2 fill-current" />
                      Export Data
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleClearAllMemories}
                      className="text-destructive focus:text-destructive"
                    >
                      <IconTrash className="h-3 w-3 mr-2 fill-current" />
                      Clear All Memories
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
} 