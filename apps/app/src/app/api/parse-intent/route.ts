import { generateText } from 'ai';
import { openai, isOpenAIAvailable } from '@/lib/openai';
import { NextResponse } from 'next/server';
import { isAlphaFeaturesEnabled } from '@/lib/feature-flags';

export async function POST(req: Request) {
  if (!isAlphaFeaturesEnabled()) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 });
  }
  try {
    // Check if OpenAI is available
    if (!isOpenAIAvailable || !openai) {
      console.warn('OpenAI not available, returning default response');
      return Response.json({ 
        type: 'none', 
        coins: [], 
        intent: 'openai_unavailable' 
      });
    }

    const { message, systemPrompt } = await req.json();
    
    const result = await generateText({
      model: openai.chat('gpt-4o-mini'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.1, // Low temperature for consistent parsing
      maxTokens: 200,
    });

    // Parse the JSON response
    const parsed = JSON.parse(result.text);
    return NextResponse.json(parsed);
    
  } catch (error) {
    console.error('Intent parsing error:', error);
    return NextResponse.json({ 
      type: 'none', 
      coins: [], 
      intent: 'failed to parse' 
    });
  }
}