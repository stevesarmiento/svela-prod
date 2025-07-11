import { auth } from "@clerk/nextjs/server";
import { NextResponse } from 'next/server';

export async function GET() {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const serverApiKey = process.env.CROSSMINT_SERVER_API_KEY;
    
    if (!serverApiKey) {
      return NextResponse.json(
        { error: 'CROSSMINT_SERVER_API_KEY is not configured' },
        { status: 500 }
      );
    }

    console.log("Testing Crossmint API key...");
    
    // Test the API key by trying to list wallets
    const testResponse = await fetch('https://staging.crossmint.com/api/v1-alpha1/wallets', {
      method: 'GET',
      headers: {
        'X-API-KEY': serverApiKey,
        'Content-Type': 'application/json',
      },
    });

    console.log("Test response status:", testResponse.status);
    console.log("Test response headers:", Object.fromEntries(testResponse.headers.entries()));
    
    const responseText = await testResponse.text();
    console.log("Test response body:", responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return NextResponse.json({
      apiKeyConfigured: !!serverApiKey,
      apiKeyLength: serverApiKey.length,
      apiKeyPrefix: serverApiKey.substring(0, 20) + "...",
      testEndpoint: 'GET /api/v1-alpha1/wallets',
      responseStatus: testResponse.status,
      responseOk: testResponse.ok,
      responseData,
      recommendations: {
        status200: "API key is working correctly",
        status401: "API key is invalid or expired",
        status403: "API key lacks required scopes. Add: wallets.read, wallets.create, wallets:transactions.create, wallets:transactions.sign",
        status404: "Wrong API endpoint or environment",
        status500: "Crossmint server error"
      }
    });

  } catch (error) {
    console.error('API test error:', error);
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Failed to test Crossmint API key'
    }, { status: 500 });
  }
} 