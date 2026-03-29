import { type NextRequest, NextResponse } from 'next/server';
import { capxMemoryService } from '@/lib/capx-memory';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!capxMemoryService.isAvailable()) {
      return NextResponse.json({ error: 'Memory service not available' }, { status: 503 });
    }

    // Get all memories for export
    const allMemories = await capxMemoryService.retrieveContext(
      userId,
      '', // Empty query to get all memories
      10000 // Get a very large number to export all
    );

    // Format export data
    const exportData = {
      exportDate: new Date().toISOString(),
      userId: userId,
      totalMemories: allMemories.count,
      memories: allMemories.memories.map(memory => ({
        id: memory.memoryId,
        text: memory.text,
        metadata: memory.metadata,
        score: memory.score,
        createdAt: new Date(memory.createdAt * 1000).toISOString(),
      }))
    };

    // Create JSON blob for download
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="memories-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });

  } catch (error) {
    console.error('Memory export error:', error);
    return NextResponse.json(
      { error: 'Failed to export memories' }, 
      { status: 500 }
    );
  }
} 