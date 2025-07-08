import { NextRequest, NextResponse } from 'next/server';
import { capxMemoryService } from '@/lib/capx-memory';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!capxMemoryService.isAvailable()) {
      return NextResponse.json({ error: 'Memory service not available' }, { status: 503 });
    }

    // Get all memories to calculate stats
    const allMemories = await capxMemoryService.retrieveContext(
      userId,
      '', // Empty query to get all memories
      1000 // Get a large number to calculate stats
    );

    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

    // Calculate stats
    const totalMemories = allMemories.count;
    const lastWeek = allMemories.memories.filter(memory => 
      memory.createdAt * 1000 > oneWeekAgo
    ).length;

    // Estimate storage used (rough calculation)
    const totalTextLength = allMemories.memories.reduce((total, memory) => 
      total + memory.text.length, 0
    );
    const storageUsed = `${Math.round(totalTextLength / 1024)} KB`;

    // Find oldest memory
    const oldestMemory = allMemories.memories.length > 0 
      ? allMemories.memories.reduce((oldest, memory) => 
          memory.createdAt < oldest.createdAt ? memory : oldest
        )
      : null;

    const oldestMemoryDate = oldestMemory 
      ? new Date(oldestMemory.createdAt * 1000).toLocaleDateString()
      : 'No data';

    const stats = {
      totalMemories,
      lastWeek,
      storageUsed,
      oldestMemory: oldestMemoryDate
    };

    return NextResponse.json({ success: true, stats });

  } catch (error) {
    console.error('Memory stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get memory statistics' }, 
      { status: 500 }
    );
  }
} 