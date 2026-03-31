// Enhanced client-safe memory utilities with advanced Cap.X API integration
// Following Cap.X API best practices for better performance and reliability

// Types for structured metadata
interface StructuredMetadata {
  category: 'preference' | 'chat' | 'analysis' | 'user_setting' | 'session';
  source: 'chat' | 'ui' | 'system' | 'import';
  tags: string[];
  priority: number; // 1-10 scale for importance
  namespace: string;
  sessionId?: string;
  intentType?: string;
  dataQuality?: 'high' | 'medium' | 'low';
  dataSources?: string[];
  processingType?: 'enhanced' | 'fallback' | 'realtime';
  timestamp: number;
  [key: string]: unknown;
}

// Processing strategy options
type ProcessingStrategy = 'raw' | 'summarize_if_long' | 'extract_facts';

// Memory context for chat integration
interface MemoryContext {
  preferences: { memories: unknown[]; count?: number };
  recent: { memories: unknown[]; count?: number };
  domain: { memories: unknown[]; count?: number };
}

// Enhanced retry logic with exponential backoff
async function callWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // Rate limited - wait and retry
        const delay = Math.min(1000 * 2 ** attempt, 10000);
        console.log(`⏳ Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delay = Math.min(1000 * 2 ** attempt, 10000);
      console.log(`⚠️ Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Get optimal processing strategy based on content type and user tier
function getOptimalStrategy(text: string, userTier = 'free'): ProcessingStrategy {
  if (userTier === 'free') return 'raw';
  
  if (text.length > 2000) return 'summarize_if_long';
  if (text.includes('preference') || text.includes('setting')) return 'extract_facts';
  
  return 'raw';
}

// Enhanced memory storage with structured metadata
export async function storeMemoryWithMetadata(
  userId: string,
  text: string,
  metadata: Partial<StructuredMetadata>,
  strategy?: ProcessingStrategy
): Promise<boolean> {
  try {
    const structuredMetadata: StructuredMetadata = {
      category: metadata.category || 'chat',
      source: metadata.source || 'chat',
      tags: metadata.tags || [],
      priority: metadata.priority || 5,
      namespace: metadata.namespace || 'default',
      timestamp: Date.now(),
      ...metadata
    };

    const optimalStrategy = strategy || getOptimalStrategy(text);

    console.log('🔄 Storing memory with data:', {
      userId,
      textLength: text.length,
      metadata: structuredMetadata,
      strategy: optimalStrategy
    });

    const response = await callWithRetry('/api/memory/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        text,
        metadata: structuredMetadata,
        strategy: optimalStrategy
      })
    });

    console.log('📥 Memory store response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Memory store API error:', response.status, errorText);
      return false;
    }

    const result = await response.json();
    console.log('📊 Memory store result:', result);
    
    return !!result.success;
  } catch (error) {
    console.error('Failed to store memory with metadata:', error);
    return false;
  }
}

// Smart context integration for chat
export async function getChatContext(
  userId: string, 
  currentMessage: string
): Promise<MemoryContext> {
  try {
    const [preferences, recentContext, domainContext] = await Promise.all([
      // Get user preferences
      callWithRetry('/api/memory/retrieve-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          query: 'user preferences and settings',
          limit: 2,
          category: 'preference'
        })
      }),
      
      // Get recent conversation context
      callWithRetry('/api/memory/retrieve-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          query: currentMessage,
          limit: 3,
          source: 'chat'
        })
      }),
      
      // Get domain-specific context
      callWithRetry('/api/memory/retrieve-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          query: currentMessage,
          limit: 2,
          priority: 8 // High priority memories
        })
      })
    ]);

    return {
      preferences: await preferences.json(),
      recent: await recentContext.json(),
      domain: await domainContext.json()
    };
  } catch (error) {
    console.error('Failed to get chat context:', error);
    return {
      preferences: { memories: [] },
      recent: { memories: [] },
      domain: { memories: [] }
    };
  }
}

// Enhanced session cleanup with better targeting
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
    
    const response = await callWithRetry('/api/memory/cleanup-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId,
        minutesAgo: 5, // Clean up last 5 minutes
        metadataFilter: {
          category: 'session',
          source: 'chat'
        }
      })
    });

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

// Enhanced intent-based retrieval
export async function retrieveMemoriesWithIntent(
  userId: string,
  query: string,
  intentType?: string,
  options?: {
    limit?: number;
    category?: string;
    source?: string;
    tags?: string[];
    priority?: number;
    namespace?: string;
  }
): Promise<{ memories: unknown[]; count: number }> {
  try {
    const response = await callWithRetry('/api/memory/retrieve-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        query: intentType ? `${query} (intent: ${intentType})` : query,
        limit: options?.limit || 3,
        category: options?.category,
        source: options?.source,
        tags: options?.tags,
        priority: options?.priority,
        namespace: options?.namespace,
        useSlowIntent: false // For faster responses
      })
    });

    return await response.json();
  } catch (error) {
    console.error('Failed to retrieve memories with intent:', error);
    return { memories: [], count: 0 };
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
    const response = await callWithRetry('/api/memory/forget', {
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
    const response = await callWithRetry('/api/memory/bulk-cleanup', {
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

// Batch memory operations for efficiency
export async function batchStoreMemories(
  userId: string,
  memories: Array<{
    text: string;
    metadata: Partial<StructuredMetadata>;
    strategy?: ProcessingStrategy;
  }>
): Promise<{ success: boolean; count: number }> {
  try {
    const structuredMemories = memories.map(memory => ({
      text: memory.text,
      metadata: {
        category: memory.metadata.category || 'chat',
        source: memory.metadata.source || 'chat',
        tags: memory.metadata.tags || [],
        priority: memory.metadata.priority || 5,
        namespace: memory.metadata.namespace || 'default',
        timestamp: Date.now(),
        ...memory.metadata
      } as StructuredMetadata,
      strategy: memory.strategy || getOptimalStrategy(memory.text)
    }));

    const response = await callWithRetry('/api/memory/batch-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        memories: structuredMemories
      })
    });

    const result = await response.json();
    return {
      success: result.success,
      count: result.count || 0
    };
  } catch (error) {
    console.error('Failed to batch store memories:', error);
    return { success: false, count: 0 };
  }
}

// Session management utility
export async function createMemorySession(
  userId: string,
  sessionId: string,
  metadata: Partial<StructuredMetadata> = {}
): Promise<boolean> {
  try {
    const sessionMetadata: StructuredMetadata = {
      category: 'session',
      source: 'system',
      tags: ['session_start'],
      priority: 5,
      namespace: 'sessions',
      sessionId,
      timestamp: Date.now(),
      ...metadata
    };

    return await storeMemoryWithMetadata(
      userId,
      `Session started: ${sessionId}`,
      sessionMetadata,
      'raw'
    );
  } catch (error) {
    console.error('Failed to create memory session:', error);
    return false;
  }
}

export async function endMemorySession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  try {
    // Clean up session memories
    const result = await bulkCleanupMemories(userId, {
      metadataFilter: { 
        sessionId,
        category: 'session'
      }
    });

    console.log(`🔚 Ended session ${sessionId}, cleaned ${result.count} memories`);
    return result.success;
  } catch (error) {
    console.error('Failed to end memory session:', error);
    return false;
  }
}

// Export types for use in other files
export type { StructuredMetadata, ProcessingStrategy, MemoryContext }; 