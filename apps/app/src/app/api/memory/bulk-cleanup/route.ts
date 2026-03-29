import { type NextRequest, NextResponse } from 'next/server';
import { capxMemoryService } from '@/lib/capx-memory';

export async function POST(request: NextRequest) {
  try {
    const { userId, olderThanDays, metadataFilter } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!capxMemoryService.isAvailable()) {
      return NextResponse.json({ error: 'Memory service not available' }, { status: 503 });
    }

    // Build options for Cap.X forgetMemory
    const forgetOptions: {
      olderThanDays?: number;
      metadataFilter?: Record<string, unknown>;
    } = {};

    if (olderThanDays !== undefined) {
      forgetOptions.olderThanDays = olderThanDays;
    }

    if (metadataFilter) {
      forgetOptions.metadataFilter = metadataFilter;
    }

    // Call Cap.X forgetMemory API
    const result = await capxMemoryService.forgetMemory(userId, forgetOptions);

    return NextResponse.json({ 
      success: true, 
      count: result.count,
      message: result.message
    });

  } catch (error) {
    console.error('Bulk cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to perform bulk cleanup' }, 
      { status: 500 }
    );
  }
} 