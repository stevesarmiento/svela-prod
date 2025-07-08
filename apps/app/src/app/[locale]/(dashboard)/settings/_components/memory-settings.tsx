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

interface MemoryStats {
  totalMemories: number;
  lastWeek: number;
  storageUsed: string;
  oldestMemory: string;
}

export function MemorySettings() {
  const { user } = useAuth();
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState('30');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [memoryStats, setMemoryStats] = useState<MemoryStats>({
    totalMemories: 0,
    lastWeek: 0,
    storageUsed: '0 MB',
    oldestMemory: 'No data'
  });

  // Fetch memory stats on component mount
  useEffect(() => {
    const fetchMemoryStats = async () => {
      if (!user?.id) return;
      
      try {
        setIsLoadingStats(true);
        const response = await fetch(`/api/memory/stats?userId=${user.id}`);
        const data = await response.json();
        
        if (data.success) {
          setMemoryStats(data.stats);
        }
      } catch (error) {
        console.error('Failed to fetch memory stats:', error);
        toast.error('Failed to load memory statistics');
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchMemoryStats();
  }, [user?.id]);

  // Handle memory toggle and retention changes
  const handleMemoryToggle = async (enabled: boolean) => {
    setMemoryEnabled(enabled);
    // Save to localStorage for now (could be saved to database later)
    localStorage.setItem('memoryEnabled', enabled.toString());
    toast.success(`Memory ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleRetentionChange = async (days: string) => {
    setRetentionDays(days);
    // Save to localStorage for now
    localStorage.setItem('retentionDays', days);
    toast.success(`Retention period updated to ${days === 'never' ? 'never delete' : `${days} days`}`);
  };

  // Load saved preferences
  useEffect(() => {
    const savedMemoryEnabled = localStorage.getItem('memoryEnabled');
    const savedRetentionDays = localStorage.getItem('retentionDays');
    
    if (savedMemoryEnabled !== null) {
      setMemoryEnabled(savedMemoryEnabled === 'true');
    }
    if (savedRetentionDays) {
      setRetentionDays(savedRetentionDays);
    }
  }, []);

  const handleClearOldMemories = async (days: number) => {
    if (!user?.id) {
      toast.error('Please sign in to manage memories');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/memory/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'cleanup_old',
          days: days
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success(`Cleared ${result.count} old memories`);
        
        // Refresh memory stats
        try {
          const statsResponse = await fetch(`/api/memory/stats?userId=${user.id}`);
          const statsData = await statsResponse.json();
          if (statsData.success) {
            setMemoryStats(statsData.stats);
          }
        } catch (error) {
          console.error('Failed to refresh stats:', error);
        }
      } else {
        toast.error(result.error || 'Failed to clear memories');
      }
    } catch (error) {
      toast.error('Failed to clear memories');
      console.error('Memory cleanup error:', error);
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

    await handleClearOldMemories(0); // Clear all memories
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

        {/* Memory Stats */}
        {memoryEnabled && (
          <div className="space-y-4">
            <h4 className="font-medium">Memory Usage</h4>
            {isLoadingStats ? (
              <div className="text-center p-8 text-muted-foreground">
                Loading memory statistics...
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-500">{memoryStats.totalMemories}</div>
                  <div className="text-sm text-muted-foreground">Total Memories</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-green-500">{memoryStats.lastWeek}</div>
                  <div className="text-sm text-muted-foreground">This Week</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-500">{memoryStats.storageUsed}</div>
                  <div className="text-sm text-muted-foreground">Storage Used</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-500">{memoryStats.oldestMemory}</div>
                  <div className="text-sm text-muted-foreground">Oldest Memory</div>
                </div>
              </div>
            )}

            <Separator />

            {/* Retention Settings */}
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