'use client';

import { useState, useEffect } from 'react';
import { Button } from '@v1/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@v1/ui/card';
import { Switch } from '@v1/ui/switch';
import { Label } from '@v1/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@v1/ui/select';
import { Separator } from '@v1/ui/separator';
import { IconTrash, IconGlobe, IconBrain } from 'symbols-react';
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconBrain className="h-5 w-5 text-blue-500" />
          <CardTitle>Memory & AI</CardTitle>
        </div>
        <CardDescription>
          Control how the AI remembers your conversations for personalized responses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Memory Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="memory-enabled">Enable Memory</Label>
            <p className="text-sm text-muted-foreground">
              Allow AI to remember your conversations for better context
            </p>
          </div>
          <Switch
            id="memory-enabled"
            checked={memoryEnabled}
            onCheckedChange={handleMemoryToggle}
          />
        </div>

        <Separator />

        {/* Auto-cleanup Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="auto-cleanup-enabled">Auto-cleanup Chat Sessions</Label>
            <p className="text-sm text-muted-foreground">
              Automatically delete memories when chat sessions end
            </p>
          </div>
          <Switch
            id="auto-cleanup-enabled"
            checked={autoCleanupEnabled}
            onCheckedChange={handleAutoCleanupToggle}
          />
        </div>

        <Separator />

        {/* Retention Settings */}
        {memoryEnabled && (
          <div className="space-y-4">
            <h4 className="font-medium">Memory Retention</h4>
            <div className="flex items-center gap-4">
              <Label htmlFor="retention-days">Auto-delete memories older than:</Label>
              <Select value={retentionDays} onValueChange={handleRetentionChange}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Memory Actions */}
            <div className="space-y-4">
              <h4 className="font-medium">Memory Management</h4>
              <div className="flex gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleClearOldMemories(30)}
                  disabled={isLoading}
                >
                  Clear 30+ Days Old
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleClearOldMemories(7)}
                  disabled={isLoading}
                >
                  Clear 7+ Days Old
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearSessionMemories}
                  disabled={isLoading}
                >
                  Clear Chat Sessions
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportMemories}
                  disabled={isLoading}
                >
                  <IconGlobe className="h-4 w-4 mr-2" />
                  Export Data
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearAllMemories}
                  disabled={isLoading}
                >
                  <IconTrash className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 