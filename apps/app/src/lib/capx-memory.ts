import { env } from '@/env.mjs';

interface CapxMemory {
  memoryId: string;
  text: string;
  metadata: Record<string, unknown>;
  score: number;
  createdAt: number;
}

interface CapxContextResponse {
  memories: CapxMemory[];
  query: string;
  count: number;
}

interface CapxAddMemoryResponse {
  success: boolean;
  memoryId: string;
  processedText: string;
  strategyUsed: string;
}

interface CapxForgetMemoryResponse {
  success: boolean;
  count: number;
  message: string;
}

class CapxMemoryService {
  private baseUrl = 'https://capi.dev/api/v1';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-CAPI-API-Key': this.apiKey,
    };
  }

  async addMemory(
    userId: string,
    text: string,
    metadata: Record<string, unknown> = {},
    strategy: 'raw' | 'summarize_if_long' | 'extract_facts' = 'raw'
  ): Promise<CapxAddMemoryResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/addMemory`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          userId,
          text,
          metadata,
          strategy,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to add memory: ${error.error || 'Unknown error'}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error adding memory:', error);
      throw error;
    }
  }

  async retrieveContext(
    userId: string,
    query: string,
    limit = 3,
    metadataFilter?: Record<string, unknown>
  ): Promise<CapxContextResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/retrieveContext`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          userId,
          query,
          limit,
          metadataFilter,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to retrieve context: ${error.error || 'Unknown error'}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error retrieving context:', error);
      throw error;
    }
  }

  async forgetMemory(
    userId: string,
    options: {
      memoryId?: string;
      olderThanDays?: number;
      metadataFilter?: Record<string, unknown>;
    }
  ): Promise<CapxForgetMemoryResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/forgetMemory`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          userId,
          ...options,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to forget memory: ${error.error || 'Unknown error'}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error forgetting memory:', error);
      throw error;
    }
  }

  // Helper method to clean up old memories
  async cleanupOldMemories(userId: string, days = 30): Promise<CapxForgetMemoryResponse> {
    console.log(`🧹 Cleaning up memories older than ${days} days for user: ${userId}`);
    return this.forgetMemory(userId, { olderThanDays: days });
  }

  // Helper method to clean up temporary session data
  async cleanupSessionData(userId: string): Promise<CapxForgetMemoryResponse> {
    console.log(`🧹 Cleaning up temporary session data for user: ${userId}`);
    return this.forgetMemory(userId, { 
      metadataFilter: { source: 'temp_session' } 
    });
  }

  // Helper method to check if memory service is available
  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

// Create singleton instance
const capxMemoryService = new CapxMemoryService(env.X_CAPI_API_KEY || '');

export { capxMemoryService, type CapxMemory, type CapxContextResponse }; 