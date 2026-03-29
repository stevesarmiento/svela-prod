import { type NextRequest, NextResponse } from 'next/server';
import { capxMemoryService } from '@/lib/capx-memory';
import { isAlphaFeaturesEnabled } from '@/lib/feature-flags';

export async function POST(request: NextRequest) {
  if (!isAlphaFeaturesEnabled()) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 });
  }

  try {
    const { userId, text, metadata, strategy } = await request.json();

    if (!userId || !text) {
      return NextResponse.json({ error: 'User ID and text are required' }, { status: 400 });
    }

    // Store the memory with enhanced metadata and strategy
    const result = await capxMemoryService.addMemory(
      userId,
      text,
      metadata || {},
      strategy || 'raw',
    );

    return NextResponse.json({ 
      success: true, 
      memoryId: result.memoryId,
      message: 'Memory stored successfully'
    });

  } catch (error) {
    console.error('Store memory error:', error);
    return NextResponse.json(
      { error: 'Failed to store memory' }, 
      { status: 500 }
    );
  }
} 