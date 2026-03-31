// Enhanced Memory SDK - A comprehensive wrapper for Cap.X API with built-in best practices
// Following Cap.X API recommendations for optimal performance and user experience

import { 
  storeMemoryWithMetadata, 
  getChatContext, 
  retrieveMemoriesWithIntent,
  batchStoreMemories,
  bulkCleanupMemories,
  forgetMemoryById,
  autoCleanupSessionMemories,
  createMemorySession,
  endMemorySession,
  type StructuredMetadata,
  type ProcessingStrategy,
  type MemoryContext
} from './client-memory-utils';

// Enhanced SDK class with built-in best practices
export class EnhancedMemorySDK {
  private userId: string;
  private defaultNamespace: string;
  private sessionId?: string;
  private autoCleanupEnabled: boolean;

  constructor(userId: string, options: {
    defaultNamespace?: string;
    sessionId?: string;
    autoCleanupEnabled?: boolean;
  } = {}) {
    this.userId = userId;
    this.defaultNamespace = options.defaultNamespace || 'default';
    this.sessionId = options.sessionId;
    this.autoCleanupEnabled = options.autoCleanupEnabled ?? true;
  }

  // Smart memory storage with automatic strategy selection
  async storeMemory(
    text: string,
    options: {
      category?: StructuredMetadata['category'];
      source?: StructuredMetadata['source'];
      tags?: string[];
      priority?: number;
      namespace?: string;
      strategy?: ProcessingStrategy;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<boolean> {
    const metadata: Partial<StructuredMetadata> = {
      category: options.category || 'chat',
      source: options.source || 'chat',
      tags: options.tags || [],
      priority: options.priority || 5,
      namespace: options.namespace || this.defaultNamespace,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      ...options.metadata
    };

    return await storeMemoryWithMetadata(
      this.userId,
      text,
      metadata,
      options.strategy
    );
  }

  // Store user preference with appropriate metadata
  async storeUserPreference(
    preference: string,
    value: unknown,
    tags: string[] = []
  ): Promise<boolean> {
    return await this.storeMemory(
      `User preference: ${preference} = ${JSON.stringify(value)}`,
      {
        category: 'preference',
        source: 'ui',
        tags: ['preference', ...tags],
        priority: 8,
        namespace: 'user_preferences',
        strategy: 'extract_facts'
      }
    );
  }

  // Store chat conversation with context
  async storeChatMessage(
    message: string,
    isUserMessage: boolean,
    intentType?: string,
    additionalContext?: Record<string, unknown>
  ): Promise<boolean> {
    const role = isUserMessage ? 'user' : 'assistant';
    const tags = [role, 'conversation'];
    
    if (intentType) tags.push(intentType);

    return await this.storeMemory(
      `${role}: ${message}`,
      {
        category: 'chat',
        source: 'chat',
        tags,
        priority: isUserMessage ? 6 : 7,
        namespace: 'chat_conversations',
        strategy: isUserMessage ? 'extract_facts' : 'summarize_if_long',
        metadata: {
          isUserMessage,
          intentType,
          ...additionalContext
        }
      }
    );
  }

  // Store analysis or insights
  async storeAnalysis(
    analysis: string,
    dataQuality: 'high' | 'medium' | 'low',
    dataSources: string[] = [],
    tags: string[] = []
  ): Promise<boolean> {
    return await this.storeMemory(
      analysis,
      {
        category: 'analysis',
        source: 'system',
        tags: ['analysis', ...tags],
        priority: 8,
        namespace: 'analysis_results',
        strategy: 'summarize_if_long',
        metadata: {
          dataQuality,
          dataSources,
          analysisType: 'automated'
        }
      }
    );
  }

  // Retrieve memories with intelligent context
  async getSmartContext(query: string): Promise<MemoryContext> {
    return await getChatContext(this.userId, query);
  }

  // Retrieve memories by category
  async getMemoriesByCategory(
    category: StructuredMetadata['category'],
    limit = 10
  ): Promise<{ memories: unknown[]; count: number }> {
    return await retrieveMemoriesWithIntent(
      this.userId,
      '',
      undefined,
      { category, limit }
    );
  }

  // Retrieve user preferences
  async getUserPreferences(): Promise<{ memories: unknown[]; count: number }> {
    return await this.getMemoriesByCategory('preference', 20);
  }

  // Retrieve recent conversations
  async getRecentConversations(limit = 10): Promise<{ memories: unknown[]; count: number }> {
    return await retrieveMemoriesWithIntent(
      this.userId,
      '',
      undefined,
      { 
        category: 'chat',
        namespace: 'chat_conversations',
        limit 
      }
    );
  }

  // Batch store multiple memories efficiently
  async batchStore(
    memories: Array<{
      text: string;
      category?: StructuredMetadata['category'];
      source?: StructuredMetadata['source'];
      tags?: string[];
      priority?: number;
      strategy?: ProcessingStrategy;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<{ success: boolean; count: number }> {
    const formattedMemories = memories.map(memory => ({
      text: memory.text,
      metadata: {
        category: memory.category || 'chat',
        source: memory.source || 'chat',
        tags: memory.tags || [],
        priority: memory.priority || 5,
        namespace: this.defaultNamespace,
        sessionId: this.sessionId,
        timestamp: Date.now(),
        ...memory.metadata
      } as Partial<StructuredMetadata>,
      strategy: memory.strategy
    }));

    return await batchStoreMemories(this.userId, formattedMemories);
  }

  // Smart cleanup with different strategies
  async cleanupOldMemories(olderThanDays: number): Promise<{ success: boolean; count: number }> {
    return await bulkCleanupMemories(this.userId, { olderThanDays });
  }

  async cleanupByCategory(category: StructuredMetadata['category']): Promise<{ success: boolean; count: number }> {
    return await bulkCleanupMemories(this.userId, { 
      metadataFilter: { category } 
    });
  }

  async cleanupSessionMemories(): Promise<{ success: boolean; count: number }> {
    if (!this.sessionId) {
      return { success: false, count: 0 };
    }
    
    return await bulkCleanupMemories(this.userId, { 
      metadataFilter: { sessionId: this.sessionId } 
    });
  }

  // Session management
  async startSession(sessionId: string): Promise<boolean> {
    this.sessionId = sessionId;
    return await createMemorySession(this.userId, sessionId, {
      namespace: this.defaultNamespace
    });
  }

  async endSession(): Promise<boolean> {
    if (!this.sessionId) return false;
    
    const success = await endMemorySession(this.userId, this.sessionId);
    this.sessionId = undefined;
    return success;
  }

  // Auto-cleanup session memories
  async performAutoCleanup(): Promise<void> {
    if (this.autoCleanupEnabled) {
      await autoCleanupSessionMemories(this.userId);
    }
  }

  // Memory statistics and insights
  async getMemoryStats(): Promise<{
    total: number;
    byCategory: Record<string, number>;
    byNamespace: Record<string, number>;
    recentActivity: number;
  }> {
    try {
      const response = await fetch(`/api/memory/stats?userId=${this.userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch memory stats');
      }
      
      const data = await response.json();
      return {
        total: data.stats.totalMemories,
        byCategory: {},
        byNamespace: {},
        recentActivity: data.stats.lastWeek
      };
    } catch (error) {
      console.error('Failed to get memory stats:', error);
      return {
        total: 0,
        byCategory: {},
        byNamespace: {},
        recentActivity: 0
      };
    }
  }

  // Export memories for backup
  async exportMemories(): Promise<boolean> {
    try {
      const response = await fetch('/api/memory/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.userId })
      });

      if (response.ok) {
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
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to export memories:', error);
      return false;
    }
  }

  // Forget specific memory
  async forgetMemory(memoryId: string): Promise<boolean> {
    return await forgetMemoryById(this.userId, memoryId);
  }

  // Intelligent search with context
  async searchMemories(
    query: string,
    options: {
      category?: StructuredMetadata['category'];
      tags?: string[];
      limit?: number;
      minPriority?: number;
    } = {}
  ): Promise<{ memories: unknown[]; count: number }> {
    return await retrieveMemoriesWithIntent(
      this.userId,
      query,
      undefined,
      {
        category: options.category,
        tags: options.tags,
        limit: options.limit || 10,
        priority: options.minPriority
      }
    );
  }

  // Health check
  async healthCheck(): Promise<{
    available: boolean;
    userId: string;
    sessionId?: string;
    autoCleanupEnabled: boolean;
  }> {
    return {
      available: true, // We would check API availability here
      userId: this.userId,
      sessionId: this.sessionId,
      autoCleanupEnabled: this.autoCleanupEnabled
    };
  }
}

// Factory function for easy SDK creation
export function createMemorySDK(
  userId: string,
  options: {
    defaultNamespace?: string;
    sessionId?: string;
    autoCleanupEnabled?: boolean;
  } = {}
): EnhancedMemorySDK {
  return new EnhancedMemorySDK(userId, options);
}

// Export types for convenience
export type { StructuredMetadata, ProcessingStrategy, MemoryContext };

// Utility functions
export const MemoryUtils = {
  // Generate session ID
  generateSessionId: (): string => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  // Memory priority levels
  Priority: {
    LOW: 1,
    MEDIUM: 5,
    HIGH: 8,
    CRITICAL: 10
  } as const,

  // Common tag sets
  Tags: {
    USER_INTERACTION: ['user_interaction', 'ui'],
    SYSTEM_GENERATED: ['system', 'automated'],
    CONVERSATION: ['conversation', 'chat'],
    PREFERENCE: ['preference', 'setting'],
    ANALYSIS: ['analysis', 'insight'],
    ERROR: ['error', 'debugging'],
    FEEDBACK: ['feedback', 'rating']
  } as const,

  // Validate memory metadata
  validateMetadata: (metadata: Partial<StructuredMetadata>): boolean => {
    const requiredFields = ['category', 'source', 'tags', 'priority', 'namespace'];
    return requiredFields.some(field => metadata[field] !== undefined);
  }
}; 