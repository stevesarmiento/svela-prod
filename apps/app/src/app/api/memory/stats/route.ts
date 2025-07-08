import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // For now, return mock data since Cap.X doesn't provide stats endpoint
    // In a real implementation, you might store this data in your own database
    // or implement a Cap.X wrapper that tracks usage
    
    const mockStats = {
      totalMemories: Math.floor(Math.random() * 100) + 10,
      lastWeek: Math.floor(Math.random() * 20) + 1,
      storageUsed: `${(Math.random() * 5 + 0.5).toFixed(1)} MB`,
      oldestMemory: `${Math.floor(Math.random() * 30) + 1} days ago`,
      memoryBreakdown: {
        queries: Math.floor(Math.random() * 50) + 5,
        responses: Math.floor(Math.random() * 50) + 5,
        system: Math.floor(Math.random() * 10) + 1,
      },
      recentActivity: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        count: Math.floor(Math.random() * 10)
      })).reverse()
    };

    return NextResponse.json({
      success: true,
      stats: mockStats
    });

  } catch (error) {
    console.error('Memory stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch memory statistics' },
      { status: 500 }
    );
  }
} 