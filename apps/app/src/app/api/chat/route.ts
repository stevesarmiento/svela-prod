import { streamText } from 'ai';
import { gemini } from '@/lib/gemini';
import { enhancedChatHandler } from '@/lib/enhanced-chat-handler';
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    if (!Array.isArray(messages)) {
      console.error('Invalid messages format - not an array:', messages);
      return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 });
    }
    
    console.log('📩 Received chat request with', messages.length, 'messages');
    
    const latestUserMessage = messages.filter(m => m.role === 'user').pop();
    
    if (!latestUserMessage) {
      console.error('No user message found in request');
      return NextResponse.json({ error: 'No user message found' }, { status: 400 });
    }
    
    console.log('🔍 Processing user message:', latestUserMessage.content);
    
    // Always use enhanced processing for better responses
    console.log('🚀 Using enhanced chat processing');
    
    try {
      const enhancedResponse = await enhancedChatHandler.processChat(latestUserMessage.content);
      console.log('✅ Enhanced response generated:', {
        hasTextResponse: !!enhancedResponse.textResponse,
        componentsCount: enhancedResponse.components.length,
        processingTime: enhancedResponse.processingTime
      });
      
      // Create component data for the first component (if any)
      let componentData = null;
      if (enhancedResponse.components.length > 0) {
        const firstComponent = enhancedResponse.components[0];
        
        if (firstComponent && firstComponent.type === 'price_card') {
          componentData = {
            type: 'price_card',
            data: firstComponent.data
          };
          console.log('📦 Component data to send:', { type: firstComponent.type, data: firstComponent.data });
        } else if (firstComponent && firstComponent.type === 'comparison_chart') {
          componentData = {
            type: 'comparison_chart',
            data: firstComponent.data
          };
          console.log('📦 Comparison chart data to send:', { type: firstComponent.type, data: firstComponent.data });
        }
      }
      
      // Use enhanced content for streaming
      const enhancedSystemPrompt = `You are a sophisticated cryptocurrency analyst providing the following analysis. The response has already been analyzed and enhanced - simply format it properly:

${enhancedResponse.textResponse}`;
      
      console.log('🔄 Falling through to normal streaming with enhanced content');
      
      if (!gemini) {
        throw new Error('Gemini AI is not available. Please configure GOOGLE_GENERATIVE_AI_API_KEY.');
      }
      
      const result = await streamText({
        model: gemini('gemini-2.5-flash'),
        messages: [
          {
            role: 'system',
            content: enhancedSystemPrompt,
          },
          {
            role: 'user',
            content: latestUserMessage.content,
          },
        ],
        temperature: 0.1, // Very low temperature since content is pre-generated
        maxTokens: 3000,
      });

      const response = result.toDataStreamResponse({
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Content-Type-Options': 'nosniff',
          'X-Enhanced-Response': 'true',
        },
      });

      // Add component data and enhanced metadata to headers
      if (componentData) {
        response.headers.set('X-Component-Data', JSON.stringify(componentData));
      }
      
      response.headers.set('X-Enhanced-Metadata', JSON.stringify({
        processingTime: enhancedResponse.processingTime,
        dataQuality: enhancedResponse.dataContext.metadata.quality,
        dataSources: enhancedResponse.dataContext.metadata.sources,
        intentType: enhancedResponse.dataContext.intent.type,
        componentsGenerated: enhancedResponse.components.length
      }));
      
      console.log('🎯 Enhanced response sent via normal');
      return response;

    } catch (enhancedError) {
      console.error('❌ Enhanced chat processing failed:', enhancedError);
      
      // Fallback to basic chat
      console.log('⬇️ Falling back to basic chat processing');
      
      const basicSystemPrompt = `You are a helpful AI assistant with knowledge about cryptocurrency markets. 

**FORMATTING REQUIREMENTS:**
- Format your response using **Markdown** for better readability
- Use **## headers** for main sections
- Use **### subheaders** for subsections
- Use **bold** for important numbers and key insights
- Use *italics* for emphasis and trends
- Use bullet points (-) for lists
- Use \`inline code\` for technical terms and indicators
- Keep responses well-structured and scannable

Provide clear, concise, and helpful responses about cryptocurrency topics.`;

      if (!gemini) {
        throw new Error('Gemini AI is not available. Please configure GOOGLE_GENERATIVE_AI_API_KEY.');
      }

      const result = await streamText({
        model: gemini('gemini-2.5-flash'),
        messages: [
          {
            role: 'system',
            content: basicSystemPrompt,
          },
          ...messages,
        ],
        temperature: 0.3,
        maxTokens: 3000,
      });

      return result.toDataStreamResponse({
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}