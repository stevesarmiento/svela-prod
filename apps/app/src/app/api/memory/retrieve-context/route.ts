import { type NextRequest, NextResponse } from 'next/server';
import { capxMemoryService } from '@/lib/capx-memory';
import { isAlphaFeaturesEnabled } from '@/lib/feature-flags';

export async function POST(request: NextRequest) {
  if (!isAlphaFeaturesEnabled()) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 });
  }

  try {
    const { 
      userId, 
      query, 
      limit = 3,
      category,
      source,
      tags,
      priority,
      namespace
    } = await request.json();

    if (!userId || !query) {
      return NextResponse.json({ error: 'User ID and query are required' }, { status: 400 });
    }

    // Build metadata filter from structured parameters
    const metadataFilter: Record<string, unknown> = {};
    
    if (category) metadataFilter.category = category;
    if (source) metadataFilter.source = source;
    if (tags && tags.length > 0) metadataFilter.tags = tags;
    if (priority) metadataFilter.priority = priority;
    if (namespace) metadataFilter.namespace = namespace;

    // Retrieve context with advanced filtering
    const result = await capxMemoryService.retrieveContext(
      userId,
      query,
      limit,
      Object.keys(metadataFilter).length > 0 ? metadataFilter : undefined
    );

    return NextResponse.json({ 
      success: true, 
      memories: result.memories,
      count: result.count,
      query: query,
      filters: metadataFilter
    });

  } catch (error) {
    console.error('Retrieve context error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve context' }, 
      { status: 500 }
    );
  }
} 