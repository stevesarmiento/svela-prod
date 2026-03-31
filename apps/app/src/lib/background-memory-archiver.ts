// Background Memory Archiver - Run as cron job for optimal performance
// This should be called periodically (hourly, daily) not during chat interactions

import { retrieveMemoriesWithIntent, batchStoreMemories, bulkCleanupMemories } from './client-memory-utils';

export interface ArchiveJobConfig {
  olderThanMinutes?: number; // Archive memories older than X minutes
  batchSize?: number; // Process memories in batches
  dryRun?: boolean; // Test mode - don't actually archive
}

export interface ArchiveJobResult {
  success: boolean;
  archivedCount: number;
  deletedCount: number;
  errors: string[];
  duration: number;
}

/**
 * Archives old chat memories in batches
 * Should be run as a background job, NOT during user interactions
 */
export async function archiveOldMemories(
  userId: string, 
  config: ArchiveJobConfig = {}
): Promise<ArchiveJobResult> {
  const startTime = Date.now();
  const {
    olderThanMinutes = 60, // Default: archive memories older than 1 hour
    batchSize = 50,
    dryRun = false
  } = config;
  
  const result: ArchiveJobResult = {
    success: false,
    archivedCount: 0,
    deletedCount: 0,
    errors: [],
    duration: 0
  };

  try {
    console.log(`🔄 [Background Job] Starting memory archive for user ${userId}`);
    console.log(`📊 Config: olderThan=${olderThanMinutes}min, batchSize=${batchSize}, dryRun=${dryRun}`);
    
    // Get old chat memories
    const oldMemories = await retrieveMemoriesWithIntent(
      userId,
      '',
      undefined,
      {
        category: 'chat',
        source: 'chat',
        limit: batchSize
      }
    );

    if (oldMemories.count === 0) {
      console.log(`💡 [Background Job] No memories found to archive for user ${userId}`);
      result.success = true;
      result.duration = Date.now() - startTime;
      return result;
    }

    // Filter memories older than specified time
    const cutoffTime = Date.now() - (olderThanMinutes * 60 * 1000);
    const memoriesToArchive = oldMemories.memories.filter((memoryObj: unknown) => {
      const memory = memoryObj as { metadata?: { timestamp?: number } };
      const timestamp = memory.metadata?.timestamp || 0;
      return timestamp < cutoffTime;
    });

    console.log(`📚 [Background Job] Found ${memoriesToArchive.length} memories to archive (older than ${olderThanMinutes} minutes)`);

    if (memoriesToArchive.length === 0) {
      console.log(`💡 [Background Job] No old memories found for user ${userId}`);
      result.success = true;
      result.duration = Date.now() - startTime;
      return result;
    }

    if (dryRun) {
      console.log(`🧪 [Background Job] DRY RUN - Would archive ${memoriesToArchive.length} memories`);
      result.success = true;
      result.archivedCount = memoriesToArchive.length;
      result.duration = Date.now() - startTime;
      return result;
    }

    // Create archived versions
    const archiveMemories = memoriesToArchive.map((memoryObj: unknown) => {
      const memory = memoryObj as { text: string; metadata?: Record<string, unknown> };
      const existingTags = Array.isArray(memory.metadata?.tags) ? memory.metadata.tags as string[] : [];
      
      return {
        text: memory.text,
        metadata: {
          category: 'chat' as const,
          source: 'chat' as const,
          tags: ['archived', 'background_archived', ...existingTags],
          priority: 2, // Lower priority for background archived
          namespace: 'chat_archive_background',
          timestamp: Date.now(),
          archived: true,
          archivedAt: Date.now(),
          archivedBy: 'background_job',
          originalNamespace: (memory.metadata?.namespace as string) || 'chat_conversations'
        },
        strategy: 'summarize_if_long' as const
      };
    });

    // Batch store archived versions
    console.log(`📦 [Background Job] Archiving ${archiveMemories.length} memories...`);
    const archiveResult = await batchStoreMemories(userId, archiveMemories);
    
    if (archiveResult.success) {
      console.log(`✅ [Background Job] Successfully archived ${archiveResult.count} memories`);
      result.archivedCount = archiveResult.count;
      
      // Clean up original memories after successful archiving
      const cleanupResult = await bulkCleanupMemories(userId, {
        metadataFilter: {
          category: 'chat',
          source: 'chat',
          archived: { $ne: true } // Only cleanup non-archived memories
        }
      });
      
      console.log(`🧹 [Background Job] Cleaned up ${cleanupResult.count} original memories`);
      result.deletedCount = cleanupResult.count;
      result.success = true;
      
    } else {
      const error = `Failed to archive memories: ${JSON.stringify(archiveResult)}`;
      console.error(`❌ [Background Job] ${error}`);
      result.errors.push(error);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ [Background Job] Archive failed:", error);
    result.errors.push(errorMessage);
  }

  result.duration = Date.now() - startTime;
  console.log(`⏱️ [Background Job] Archive completed in ${result.duration}ms`);
  
  return result;
}

/**
 * Bulk archive for multiple users - useful for system-wide cleanup
 */
export async function archiveAllUsersMemories(
  userIds: string[],
  config: ArchiveJobConfig = {}
): Promise<Record<string, ArchiveJobResult>> {
  console.log(`🔄 [Background Job] Starting bulk archive for ${userIds.length} users`);
  
  const results: Record<string, ArchiveJobResult> = {};
  
  for (const userId of userIds) {
    try {
      results[userId] = await archiveOldMemories(userId, config);
      
      // Small delay between users to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ [Background Job] Failed to archive for user ${userId}:`, error);
      results[userId] = {
        success: false,
        archivedCount: 0,
        deletedCount: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        duration: 0
      };
    }
  }
  
  console.log(`✅ [Background Job] Bulk archive completed for ${userIds.length} users`);
  return results;
}

/**
 * Example cron job function - call this from your scheduler
 */
export async function runMemoryArchiveCronJob(): Promise<void> {
  console.log('⏰ [Cron Job] Memory archive job started');
  
  try {
    // Example: Get list of active users (you'd implement this based on your user system)
    // const activeUserIds = await getActiveUserIds();
    
    // For now, this is just a placeholder
    console.log('💡 [Cron Job] Add your user ID fetching logic here');
    console.log('💡 [Cron Job] Then call: await archiveAllUsersMemories(activeUserIds, { olderThanMinutes: 60 })');
    
  } catch (error) {
    console.error('❌ [Cron Job] Archive job failed:', error);
  }
}

// Types already exported above with interface declarations 