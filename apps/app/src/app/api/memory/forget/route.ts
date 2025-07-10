import { NextRequest, NextResponse } from 'next/server';
import { capxMemoryService } from '@/lib/capx-memory';

export async function POST(request: NextRequest) {
  try {
    const { userId, memoryId } = await request.json();

    if (!userId || !memoryId) {
      return NextResponse.json({ error: 'User ID and Memory ID are required' }, { status: 400 });
    }

    if (!capxMemoryService.isAvailable()) {
      return NextResponse.json({ error: 'Memory service not available' }, { status: 503 });
    }

    // Forget the specific memory
    const result = await capxMemoryService.forgetMemory(userId, { memoryId });

    return NextResponse.json({ 
      success: true, 
      count: result.count,
      message: result.message
    });

  } catch (error) {
    console.error('Forget memory error:', error);
    return NextResponse.json(
      { error: 'Failed to forget memory' }, 
      { status: 500 }
    );
  }
} 