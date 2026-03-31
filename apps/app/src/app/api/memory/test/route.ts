import { type NextRequest, NextResponse } from 'next/server';
import { capxMemoryService } from '@/lib/capx-memory';
import { storeMemoryWithMetadata } from '@/lib/client-memory-utils';

export async function POST(request: NextRequest) {
  const testResults = {
    timestamp: new Date().toISOString(),
    tests: [] as Array<{ name: string; status: 'pass' | 'fail'; message: string; details?: unknown }>
  };

  try {
    const { userId = 'test-user' } = await request.json();

    // Test 1: Check if memory service is available
    const isServiceAvailable = capxMemoryService.isAvailable();
    testResults.tests.push({
      name: 'Memory Service Available',
      status: isServiceAvailable ? 'pass' : 'fail',
      message: isServiceAvailable 
        ? 'Cap.X memory service is configured and available' 
        : 'Cap.X memory service is NOT available - check X_CAPI_API_KEY environment variable'
    });

    if (!isServiceAvailable) {
      return NextResponse.json({ 
        success: false, 
        message: 'Memory service not available',
        results: testResults 
      });
    }

    // Test 2: Try direct memory storage via capxMemoryService
    try {
      const directResult = await capxMemoryService.addMemory(
        userId,
        'Test memory via direct service',
        { source: 'test', timestamp: Date.now() },
        'raw'
      );
      
      testResults.tests.push({
        name: 'Direct Memory Storage',
        status: 'pass',
        message: 'Successfully stored memory via direct service',
        details: { memoryId: directResult.memoryId, strategy: directResult.strategyUsed }
      });
    } catch (directError) {
      testResults.tests.push({
        name: 'Direct Memory Storage',
        status: 'fail',
        message: `Failed to store via direct service: ${directError instanceof Error ? directError.message : 'Unknown error'}`,
        details: directError
      });
    }

    // Test 3: Try enhanced memory storage via storeMemoryWithMetadata
    try {
      const enhancedResult = await storeMemoryWithMetadata(
        userId,
        'Test memory via enhanced function',
                 {
           category: 'chat',
           source: 'system',
           tags: ['debug', 'test'],
           priority: 5,
           namespace: 'testing'
         },
        'raw'
      );
      
      testResults.tests.push({
        name: 'Enhanced Memory Storage',
        status: enhancedResult ? 'pass' : 'fail',
        message: enhancedResult 
          ? 'Successfully stored memory via enhanced function' 
          : 'Enhanced function returned false',
        details: { success: enhancedResult }
      });
    } catch (enhancedError) {
      testResults.tests.push({
        name: 'Enhanced Memory Storage',
        status: 'fail',
        message: `Failed to store via enhanced function: ${enhancedError instanceof Error ? enhancedError.message : 'Unknown error'}`,
        details: enhancedError
      });
    }

    // Test 4: Try to retrieve memories
    try {
      const retrieveResult = await capxMemoryService.retrieveContext(
        userId,
        'test memory',
        5
      );
      
      testResults.tests.push({
        name: 'Memory Retrieval',
        status: 'pass',
        message: `Successfully retrieved ${retrieveResult.count} memories`,
        details: { 
          count: retrieveResult.count, 
          memories: retrieveResult.memories.map(m => ({ 
            id: m.memoryId, 
            text: m.text.substring(0, 50), 
            score: m.score 
          }))
        }
      });
    } catch (retrieveError) {
      testResults.tests.push({
        name: 'Memory Retrieval',
        status: 'fail',
        message: `Failed to retrieve memories: ${retrieveError instanceof Error ? retrieveError.message : 'Unknown error'}`,
        details: retrieveError
      });
    }

    // Summary
    const passedTests = testResults.tests.filter(t => t.status === 'pass').length;
    const totalTests = testResults.tests.length;
    
    return NextResponse.json({
      success: passedTests === totalTests,
      message: `Memory test completed: ${passedTests}/${totalTests} tests passed`,
      results: testResults,
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: totalTests - passedTests
      }
    });

  } catch (error) {
    testResults.tests.push({
      name: 'Overall Test',
      status: 'fail',
      message: `Test failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    });

    return NextResponse.json({
      success: false,
      message: 'Memory test failed',
      results: testResults
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Memory Test Endpoint',
    usage: 'POST to this endpoint with optional { "userId": "your-test-user-id" } to test memory functionality',
    endpoints: [
      'POST /api/memory/test - Run memory tests',
      'GET /api/memory/test - This info message'
    ]
  });
} 