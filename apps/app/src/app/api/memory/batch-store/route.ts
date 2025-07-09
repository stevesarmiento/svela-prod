import { NextRequest, NextResponse } from 'next/server';
import { capxMemoryService } from '@/lib/capx-memory';

export async function POST(request: NextRequest) {
  try {
    const { userId, memories } = await request.json();

    if (!userId || !memories || !Array.isArray(memories)) {
      return NextResponse.json({ 
        error: 'User ID and memories array are required' 
      }, { status: 400 });
    }

    if (!capxMemoryService.isAvailable()) {
      return NextResponse.json({ error: 'Memory service not available' }, { status: 503 });
    }

    // Store memories in batch
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const memory of memories) {
      try {
        const result = await capxMemoryService.addMemory(
          userId,
          memory.text,
          memory.metadata || {},
          memory.strategy || 'raw'
        );
        results.push({
          success: true,
          memoryId: result.memoryId,
          text: memory.text.substring(0, 100) // First 100 chars for reference
        });
        successCount++;
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          text: memory.text.substring(0, 100)
        });
        failureCount++;
      }
    }

    return NextResponse.json({ 
      success: failureCount === 0,
      count: successCount,
      total: memories.length,
      failures: failureCount,
      results,
      message: `Stored ${successCount} of ${memories.length} memories`
    });

  } catch (error) {
    console.error('Batch store error:', error);
    return NextResponse.json(
      { error: 'Failed to batch store memories' }, 
      { status: 500 }
    );
  }
} 