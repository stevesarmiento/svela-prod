// Client-safe memory utilities that call API routes instead of server environment variables

export async function autoCleanupSessionMemories(userId: string): Promise<void> {
  if (!userId) return;
  
  // Check if we're on the client side before accessing localStorage
  if (typeof window === 'undefined') {
    console.log('🔕 Auto-cleanup skipped during SSR');
    return;
  }
  
  const autoCleanupEnabled = localStorage.getItem('autoCleanupEnabled') === 'true';
  if (!autoCleanupEnabled) {
    console.log('🔕 Auto-cleanup disabled, skipping session cleanup');
    return;
  }

  try {
    console.log('🧹 Auto-cleaning session memories for user:', userId);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch('/api/memory/cleanup-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId,
        minutesAgo: 5 // Clean up last 5 minutes
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log('🔍 Cleanup response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Cleanup API error:', response.status, errorText);
      
      // Graceful fallback - just log the issue, don't fail
      console.log('⚠️ Memory cleanup API unavailable, continuing without session cleanup');
      return;
    }

    const result = await response.json();
    console.log('✅ Cleanup result:', result);
    
    if (result.success && result.count > 0) {
      console.log(`✅ Auto-cleaned ${result.count} session memories`);
    } else if (result.success && result.count === 0) {
      console.log('💡 No session memories to clean up');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('⏰ Memory cleanup request timed out');
    } else {
      console.error('⚠️ Auto-cleanup failed:', error);
    }
    // Graceful fallback - don't throw to prevent blocking the UI
    console.log('🔄 Continuing without session memory cleanup');
  }
}

export function isAutoCleanupEnabled(): boolean {
  // Check if we're on the client side before accessing localStorage
  if (typeof window === 'undefined') {
    return false; // Default to false during SSR
  }
  return localStorage.getItem('autoCleanupEnabled') === 'true';
}

export async function forgetMemoryById(userId: string, memoryId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/memory/forget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId,
        memoryId
      })
    });

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Failed to forget memory:', error);
    return false;
  }
}

export async function bulkCleanupMemories(userId: string, options: {
  olderThanDays?: number;
  metadataFilter?: Record<string, unknown>;
}): Promise<{ success: boolean; count: number }> {
  try {
    const response = await fetch('/api/memory/bulk-cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId,
        ...options
      })
    });

    const result = await response.json();
    return {
      success: result.success,
      count: result.count || 0
    };
  } catch (error) {
    console.error('Failed to bulk cleanup memories:', error);
    return { success: false, count: 0 };
  }
} 