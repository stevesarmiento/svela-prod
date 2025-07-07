import { streamText } from 'ai';
import { z } from 'zod';
import { openai, isOpenAIAvailable } from '@/lib/openai';
import { detectAndFetchData, formatDataForLLM } from '@/lib/data-fetcher';
import { enhancedChatHandler } from '@/lib/enhanced-chat-handler';

const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })),
});

export async function POST(req: Request) {
  try {
    // Check if OpenAI is available
    if (!isOpenAIAvailable || !openai) {
      return new Response(
        JSON.stringify({ 
          error: 'OpenAI service is not available. Please configure OPENAI_API_KEY.' 
        }), 
        { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const body = await req.json();
    const { messages } = ChatRequestSchema.parse(body);
    
    // Always use enhanced mode now
    const useEnhanced = true;
    
    console.log('🚀 Enhanced Chat Processing - Always Enhanced Mode');
    
    const latestUserMessage = messages
      .filter(m => m.role === 'user')
      .pop();
    
    console.log('Latest user message:', latestUserMessage?.content);
    
    // Enhanced processing path
    if (useEnhanced && latestUserMessage?.content) {
      console.log('🚀 Using enhanced chat processing');
      
      try {
        console.log('💫 Starting enhanced chat handler...');
        const enhancedResponse = await enhancedChatHandler.processChat(latestUserMessage.content);
        console.log('✅ Enhanced response generated:', {
          hasTextResponse: !!enhancedResponse.textResponse,
          componentsCount: enhancedResponse.components?.length || 0,
          processingTime: enhancedResponse.processingTime
        });
        
        // Store enhanced data for use in the normal streaming path
        const componentData = enhancedResponse.components[0] ? {
          type: enhancedResponse.components[0].type,
          data: enhancedResponse.components[0].data
        } : null;

        console.log('📦 Component data to send:', componentData);
        console.log('🔄 Falling through to normal streaming with enhanced content');

        // Set up enhanced system prompt and continue with normal streaming
        const enhancedSystemPrompt = `You are a sophisticated cryptocurrency analyst with access to real-time market data. 

Based on the comprehensive analysis already performed, provide this exact response to the user:

${enhancedResponse.textResponse}

Provide this response exactly as written above, maintaining the insights and analysis.`;

        const result = await streamText({
          model: openai.chat('gpt-4o-mini'),
          messages: [
            {
              role: 'system',
              content: enhancedSystemPrompt,
            },
            ...messages,
          ],
          temperature: 0.1,
          maxTokens: 1000,
        });

        const response = result.toDataStreamResponse({
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Content-Type-Options': 'nosniff',
            'X-Enhanced-Chat': 'true',
            // Include component data in header for compatibility
            ...(componentData && {
              'X-Component-Data': JSON.stringify(componentData)
            }),
            // Include additional enhanced metadata
            'X-Enhanced-Metadata': JSON.stringify({
              components: enhancedResponse.components,
              followUpSuggestions: enhancedResponse.followUpSuggestions,
              processingTime: enhancedResponse.processingTime,
              intent: enhancedResponse.dataContext.intent
            })
          }
        });

        console.log('🎯 Enhanced response sent via normal streaming');
        return response;
      } catch (error) {
        console.error('❌ Enhanced chat processing failed, falling back to basic mode:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
        // Fall through to basic processing
      }
    } else {
      console.log('⏭️ Skipping enhanced processing:', {
        useEnhanced,
        hasUserMessage: !!latestUserMessage?.content,
        reason: !useEnhanced ? 'Enhanced mode disabled' : 'No user message'
      });
    }
    
    let dataContext = '';
    let enhancedSystemPrompt = 'You are a helpful AI assistant with access to live cryptocurrency market data. Provide clear, concise, and helpful responses.';
    let componentData = null;
    
    if (latestUserMessage) {
      const dataInfo = await detectAndFetchData(latestUserMessage.content);
      console.log('Data info:', dataInfo);
      
      if (dataInfo.type !== 'none') {
        dataContext = formatDataForLLM(dataInfo);
        
        if (dataInfo.type === 'coins' && dataInfo.data) {
          if (!Array.isArray(dataInfo.data)) {
            const coin = dataInfo.data;
            console.log('Coin data:', coin);
            componentData = {
              type: 'price_card',
              data: {
                id: coin.id || 1,
                name: coin.name,
                symbol: coin.symbol,
                price: coin.quote.USD.price,
                change24h: coin.quote.USD.percent_change_24h,
                marketCap: coin.quote.USD.market_cap,
                volume24h: coin.quote.USD.volume_24h,
                rank: coin.cmc_rank,
                historical: coin.historical
              }
            };
            console.log('Component data created:', componentData);
          }
        }
        
        enhancedSystemPrompt = `You are a cryptocurrency and market data assistant with access to real-time information. 
        
When users ask about cryptocurrency prices, market data, or specific coins, use the provided live data to give accurate, current information. 

Key guidelines:
- Always use the most recent data provided in the context
- Format prices and numbers clearly (use commas for thousands)
- Highlight significant changes or trends
- Provide context for price movements when possible
- If asked about coins not in the data, mention that you'd need to fetch that specific information
- Keep responses concise since a visual price card will also be shown

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

    // Create a custom response that includes both text and component data
    const response = result.toDataStreamResponse({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });

    // If we have component data, we need to modify the response
    if (componentData) {
      console.log('Setting component data header:', componentData);
      response.headers.set('X-Component-Data', JSON.stringify(componentData));
    } else {
      console.log('No component data to set');
    }

    return response;
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