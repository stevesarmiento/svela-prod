import { NextResponse } from 'next/server';
import { capxMemoryService } from '@/lib/capx-memory';

export async function POST(req: Request) {
  try {
    if (!capxMemoryService.isAvailable()) {
      return NextResponse.json(
        { error: 'Memory service is not available. Please configure X_CAPI_API_KEY.' },
        { status: 503 }
      );
    }

    const { userId, action, days } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    type CleanupResult = Awaited<ReturnType<(typeof capxMemoryService)["cleanupOldMemories"]>>;
    let result: CleanupResult;
    
    switch (action) {
      case 'cleanup_old': {
        const cleanupDays = days || 30;
        result = await capxMemoryService.cleanupOldMemories(userId, cleanupDays);
        break;
      }
        
      case 'cleanup_session':
        result = await capxMemoryService.cleanupSessionData(userId);
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use "cleanup_old" or "cleanup_session"' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      count: result.count,
    });

  } catch (error) {
    console.error('Memory cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup memories' },
      { status: 500 }
    );
  }
} 