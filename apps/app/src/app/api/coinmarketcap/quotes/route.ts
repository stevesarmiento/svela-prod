import { NextResponse } from 'next/server';
import { fetchWithErrorHandling, BASE_URL } from '../utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json(
        { error: 'Missing ids parameter' },
        { status: 400 }
      );
    }

    const data = await fetchWithErrorHandling(
      `${BASE_URL}/cryptocurrency/quotes/latest?id=${ids}`
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in quotes endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quotes' },
      { status: 500 }
    );
  }
}