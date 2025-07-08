import { NextResponse } from 'next/server';
import { capxMemoryService } from '@/lib/capx-memory';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    if (!capxMemoryService.isAvailable()) {
      return NextResponse.json(
        { error: 'Memory service is not available' },
        { status: 503 }
      );
    }

    try {
      // Retrieve all memories for the user (using a high limit)
      const memoryData = await capxMemoryService.retrieveContext(
        userId,
        '', // Empty query to get all memories
        1000, // High limit to get most memories
      );

      // Create export data structure
      const exportData = {
        exportDate: new Date().toISOString(),
        userId: userId,
        totalMemories: memoryData.count,
        memories: memoryData.memories.map(memory => ({
          id: memory.memoryId,
          text: memory.text,
          metadata: memory.metadata,
          score: memory.score,
          createdAt: new Date(memory.createdAt * 1000).toISOString(),
        }))
      };

      // Return as downloadable JSON
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="memories-export-${userId}-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });

    } catch (error) {
      console.error('Memory export error:', error);
      return NextResponse.json(
        { error: 'Failed to export memories from Cap.X service' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Memory export error:', error);
    return NextResponse.json(
      { error: 'Failed to export memories' },
      { status: 500 }
    );
  }
} 