import { streamText } from 'ai';
import { z } from 'zod';
import { openai } from '@/lib/openai';
import { detectAndFetchData, formatDataForLLM } from '@/lib/data-fetcher';

const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = ChatRequestSchema.parse(body);
    
    // Get the latest user message to check for data requests
    const latestUserMessage = messages
      .filter(m => m.role === 'user')
      .pop();
    
    let dataContext = '';
    let enhancedSystemPrompt = 'You are a helpful AI assistant with access to live cryptocurrency market data. Provide clear, concise, and helpful responses.';
    
    if (latestUserMessage) {
      // Check if user is requesting live data
      const dataInfo = await detectAndFetchData(latestUserMessage.content);
      
      if (dataInfo.type !== 'none') {
        dataContext = formatDataForLLM(dataInfo);
        enhancedSystemPrompt = `You are a cryptocurrency and market data assistant with access to real-time information. 
        
When users ask about cryptocurrency prices, market data, or specific coins, use the provided live data to give accurate, current information. 

Key guidelines:
- Always use the most recent data provided in the context
- Format prices and numbers clearly (use commas for thousands)
- Highlight significant changes or trends
- Provide context for price movements when possible
- If asked about coins not in the data, mention that you'd need to fetch that specific information

${dataContext}`;
      }
    }

    const result = await streamText({
      model: openai.chat('gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content: enhancedSystemPrompt,
        },
        ...messages,
      ],
      temperature: 0.3, // Lower temperature for more consistent data responses
      maxTokens: 1000,
    });

    return result.toDataStreamResponse({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid message format',
          details: error.errors 
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    return new Response(
      JSON.stringify({ error: 'Failed to process chat message' }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}