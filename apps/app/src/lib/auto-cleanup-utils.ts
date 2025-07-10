import { capxMemoryService } from './capx-memory';

export async function autoCleanupSessionMemories(userId: string): Promise<void> {
  if (!userId) return;
  
  const autoCleanupEnabled = localStorage.getItem('autoCleanupEnabled') === 'true';
  if (!autoCleanupEnabled) return;

  try {
    console.log('🧹 Auto-cleaning session memories for user:', userId);
    
    // Clear recent chat session memories (last 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    // Get recent memories and delete them
    const recentContext = await capxMemoryService.retrieveContext(
      userId,
      '', // Empty query to get all
      50 // Get more to filter by timestamp
    );
    
    // Filter memories from current session (last 5 minutes)
    const sessionMemories = recentContext.memories.filter(memory => 
      memory.createdAt * 1000 > fiveMinutesAgo
    );
    
    // Delete each session memory
    for (const memory of sessionMemories) {
      await capxMemoryService.forgetMemory(userId, { memoryId: memory.memoryId });
    }
    
    if (sessionMemories.length > 0) {
      console.log(`✅ Auto-cleaned ${sessionMemories.length} session memories`);
    }
  } catch (error) {
    console.error('⚠️ Auto-cleanup failed:', error);
  }
}

export function isAutoCleanupEnabled(): boolean {
  return localStorage.getItem('autoCleanupEnabled') === 'true';
} 