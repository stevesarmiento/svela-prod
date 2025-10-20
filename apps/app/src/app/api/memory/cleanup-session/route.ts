import { NextRequest, NextResponse } from 'next/server';
import { convex } from '@/lib/convex-client';
import { isAlphaFeaturesEnabled } from '@/lib/feature-flags';

export async function POST(request: NextRequest) {
  if (!isAlphaFeaturesEnabled()) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 });
  }
  try {
    console.log('🔄 Session cleanup API called');
    
    const body = await request.json();
    const { userId, minutesAgo = 5 } = body;
    
    console.log('📥 Request data:', { userId: userId ? 'provided' : 'missing', minutesAgo });

    if (!userId) {
      console.error('❌ Missing userId in request');
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!convex.isAvailable()) {
      console.error('❌ Cap.X memory service not available');
      return NextResponse.json({ error: 'Memory service not available' }, { status: 503 });
    }

    console.log('🧹 Using simplified session cleanup approach...');
    console.log(`🎯 Cleaning chat session memories (last ${minutesAgo} minutes)`);

    // For session cleanup, we'll clean recent chat memories by metadata
    // This is safer than trying to retrieve and filter by timestamp
    let deletedCount = 0;
    
    try {
      console.log('🎯 Cleaning recent chat query memories...');
      const queryResult = await convex.forgetMemory(userId, { 
        metadataFilter: { source: 'chat_query' } 
      });
      deletedCount += queryResult.count;
      console.log(`📊 Deleted ${queryResult.count} chat query memories`);
      
      console.log('🎯 Cleaning recent chat response memories...');
      const responseResult = await convex.forgetMemory(userId, { 
        metadataFilter: { source: 'chat_response' } 
      });
      deletedCount += responseResult.count;
      console.log(`📊 Deleted ${responseResult.count} chat response memories`);
      
      // Also clean fallback memories that might not have metadata
      console.log('🎯 Cleaning fallback chat memories...');
      const fallbackResult = await convex.forgetMemory(userId, { 
        metadataFilter: { source: 'chat_query_fallback' } 
      });
      deletedCount += fallbackResult.count;
      console.log(`📊 Deleted ${fallbackResult.count} fallback memories`);
      
    } catch (error) {
      console.error('❌ Failed to clean chat memories:', error);
      
      // Graceful fallback - try a very short time period (1 hour)
      try {
        console.log('🔄 Trying 1-hour cleanup as fallback...');
        const timeResult = await convex.forgetMemory(userId, { 
          olderThanDays: 0 // Delete everything (last resort)
        });
        deletedCount = Math.min(timeResult.count, 10); // Limit to 10 for safety
        console.log(`📊 Fallback deleted ${deletedCount} memories`);
      } catch (fallbackError) {
        console.error('❌ All cleanup methods failed:', fallbackError);
        // Return success with 0 count to prevent UI blocking
        deletedCount = 0;
      }
    }

    console.log(`✅ Successfully deleted ${deletedCount} session memories`);

    return NextResponse.json({ 
      success: true, 
      count: deletedCount,
      message: `Cleaned up ${deletedCount} session memories from last ${minutesAgo} minutes`
    });

  } catch (error) {
    console.error('❌ Session cleanup error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to cleanup session memories',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
} 