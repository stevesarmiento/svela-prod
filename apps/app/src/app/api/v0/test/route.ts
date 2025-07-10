import { NextResponse } from 'next/server'
import { env } from '@/env.mjs'

export async function GET() {
  try {
    console.log('🧪 Testing v0 integration...')
    
    // Test environment variable
    const hasApiKey = !!env.V0_API_KEY
    console.log('🔑 API Key Status:', {
      hasKey: hasApiKey,
      keyLength: env.V0_API_KEY ? env.V0_API_KEY.length : 0
    })
    
    if (!hasApiKey) {
      return NextResponse.json({
        success: false,
        error: 'V0_API_KEY not configured',
        message: 'Please add V0_API_KEY to your environment variables'
      })
    }

    // Test v0 service import
    try {
      const { v0ChartGenerator } = await import('@/lib/v0-chart-generator')
      console.log('✅ v0ChartGenerator imported successfully')
      
      // Test basic chart generation with mock data
      const testResult = await v0ChartGenerator.generateChartFromQuery(
        "Test chart for Bitcoin",
        [{
          id: 1,
          name: "Bitcoin",
          symbol: "BTC",
          slug: "bitcoin",
          cmc_rank: 1,
          circulating_supply: 19000000,
          max_supply: 21000000,
          quote: {
            USD: {
              price: 45000,
              volume_24h: 25000000000,
              market_cap: 900000000000,
              percent_change_24h: 2.5
            }
          }
        }],
        { chartType: 'custom', timeframe: '24h' }
      )
      
      return NextResponse.json({
        success: true,
        message: 'v0 integration test completed',
        result: {
          success: testResult.success,
          hasComponent: !!testResult.component,
          error: testResult.error || null
        },
        apiKeyStatus: {
          configured: true,
          keyLength: env.V0_API_KEY?.length || 0
        }
      })
      
    } catch (importError) {
      console.error('❌ Failed to import or test v0ChartGenerator:', importError)
      return NextResponse.json({
        success: false,
        error: 'Failed to test v0 integration',
        details: importError instanceof Error ? importError.message : 'Unknown error',
        apiKeyStatus: {
          configured: true,
          keyLength: env.V0_API_KEY?.length || 0
        }
      })
    }
    
  } catch (error) {
    console.error('❌ v0 test failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
} 