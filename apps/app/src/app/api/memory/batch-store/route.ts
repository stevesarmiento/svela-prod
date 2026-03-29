import { type NextRequest, NextResponse } from 'next/server';
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

    // Store memories in parallel (each item is independent).
    const results = await Promise.all(
      memories.map(async (memory) => {
        try {
          const result = await capxMemoryService.addMemory(
            userId,
            memory.text,
            memory.metadata || {},
            memory.strategy || 'raw',
          );
          return {
            success: true as const,
            memoryId: result.memoryId,
            text: memory.text.substring(0, 100), // First 100 chars for reference
          };
        } catch (error) {
          return {
            success: false as const,
            error: error instanceof Error ? error.message : 'Unknown error',
            text: memory.text.substring(0, 100),
          };
        }
      }),
    );

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

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