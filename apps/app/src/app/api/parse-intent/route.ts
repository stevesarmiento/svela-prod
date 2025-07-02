import { streamText } from 'ai';
import { openai, isOpenAIAvailable } from '@/lib/openai';

export async function POST(req: Request) {
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
    
    const result = await streamText({
      model: openai.chat('gpt-4o-mini'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.1, // Low temperature for consistent parsing
      maxTokens: 200,
    });

    // Get the complete response
    let fullResponse = '';
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
    }
    
    // Parse the JSON response
    const parsed = JSON.parse(fullResponse);
    return Response.json(parsed);
    
  } catch (error) {
    console.error('Intent parsing error:', error);
    return Response.json({ 
      type: 'none', 
      coins: [], 
      intent: 'failed to parse' 
    });
  }
}