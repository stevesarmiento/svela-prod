import { streamText } from 'ai';
import { gemini } from '@/lib/gemini';
import { capxMemoryService, type CapxMemory } from '@/lib/capx-memory';
// Removed storeMemoryWithMetadata import - using direct service instead
import { NextResponse } from "next/server";
import { isAlphaFeaturesEnabled } from "@/lib/feature-flags";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!isAlphaFeaturesEnabled()) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 });
  }
  try {
    const { messages, userId } = await req.json();
    
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
    
    // Retrieve relevant memories if userId is provided and API key is available
    let relevantMemories: CapxMemory[] = [];
    const hasMemoryEnabled = capxMemoryService.isAvailable() && userId;
    
    if (hasMemoryEnabled) {
      try {
        console.log('🧠 Retrieving relevant memories for user:', userId);
        const memoryContext = await capxMemoryService.retrieveContext(
          userId,
          latestUserMessage.content,
          5 // Get up to 5 relevant memories
        );
        relevantMemories = memoryContext.memories;
        console.log('✅ Retrieved', relevantMemories.length, 'relevant memories');
      } catch (error) {
        console.error('⚠️ Failed to retrieve memories:', error);
        // Continue without memories if retrieval fails
      }
    }
    
    // Always use enhanced processing for better responses
    console.log('🚀 Using enhanced chat processing');
    
    try {
      // Dynamically import the enhanced chat handler to avoid build-time serialization issues
      const { enhancedChatHandler } = await import('@/lib/enhanced-chat-handler');
      const enhancedResponse = await enhancedChatHandler.processChat(latestUserMessage.content);
      console.log('✅ Enhanced response generated:', {
        hasTextResponse: !!enhancedResponse.textResponse,
        componentsCount: enhancedResponse.components.length,
        processingTime: enhancedResponse.processingTime,
        intentType: enhancedResponse.dataContext.intent.type,
        firstComponentType: enhancedResponse.components[0]?.type
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
        } else if (firstComponent && firstComponent.type === 'trade_preview') {
          componentData = {
            type: 'trade_preview',
            data: firstComponent.data
          };
          console.log('📦 Trade preview data to send:', { type: firstComponent.type, data: firstComponent.data });
        }
      }
      
      // Prepare memory context for the AI
      let memoryContext = '';
      if (relevantMemories.length > 0) {
        memoryContext = `\n\n**Relevant Context from Previous Conversations:**\n${relevantMemories
          .map((memory, index) => `${index + 1}. ${memory.text} (Score: ${memory.score.toFixed(2)})`)
          .join('\n')}\n\n`;
      }
      
      // Use enhanced content for streaming
      const enhancedSystemPrompt = `You are a sophisticated cryptocurrency analyst providing the following analysis. The response has already been analyzed and enhanced - simply format it properly:

${enhancedResponse.textResponse}${memoryContext}`;
      
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
          'X-Enhanced-Chat': 'true',
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
      
      // Store the conversation in memory if enabled
      if (hasMemoryEnabled) {
        try {
          console.log('💾 Storing conversation in memory for userId:', userId);
          console.log('🔑 Memory service available:', capxMemoryService.isAvailable());
          
          // Store the user's query with enhanced metadata
          const userMemoryResult = await capxMemoryService.addMemory(
            userId,
            `User asked: "${latestUserMessage.content}"`,
            {
              category: 'chat',
              source: 'chat',
              tags: ['user_query', enhancedResponse.dataContext.intent.type],
              priority: 6,
              namespace: 'chat_conversations',
              intentType: enhancedResponse.dataContext.intent.type,
              processingType: 'enhanced',
              timestamp: Date.now(),
            },
            'extract_facts'
          );
          
          console.log('💾 User query storage result:', {
            success: !!userMemoryResult.memoryId,
            memoryId: userMemoryResult.memoryId,
            strategy: userMemoryResult.strategyUsed
          });
          
          // Store key insights from the response
          const responseInsights = enhancedResponse.textResponse.length > 500 
            ? enhancedResponse.textResponse.substring(0, 500) + '...'
            : enhancedResponse.textResponse;
            
          const responseMemoryResult = await capxMemoryService.addMemory(
            userId,
            `Analysis provided: ${responseInsights}`,
            {
              category: 'chat',
              source: 'chat',
              tags: ['ai_response', enhancedResponse.dataContext.intent.type],
              priority: 7,
              namespace: 'chat_conversations',
              intentType: enhancedResponse.dataContext.intent.type,
              dataQuality: enhancedResponse.dataContext.metadata.quality,
              dataSources: enhancedResponse.dataContext.metadata.sources,
              processingType: 'enhanced',
              timestamp: Date.now(),
            },
            'summarize_if_long'
          );
          
          console.log('💾 AI response storage result:', {
            success: !!responseMemoryResult.memoryId,
            memoryId: responseMemoryResult.memoryId,
            strategy: responseMemoryResult.strategyUsed
          });
          
          if (userMemoryResult.memoryId && responseMemoryResult.memoryId) {
            console.log('✅ Both memories stored successfully:', {
              userMemoryId: userMemoryResult.memoryId,
              responseMemoryId: responseMemoryResult.memoryId
            });
          } else {
            console.warn('⚠️ Some memories failed to store:', {
              userQuery: !!userMemoryResult.memoryId,
              aiResponse: !!responseMemoryResult.memoryId
            });
          }
        } catch (error) {
          console.error('⚠️ Failed to store conversation in memory:', error);
          // Continue without storing memory if it fails
        }
      } else {
        console.log('🔕 Memory not enabled - hasMemoryEnabled:', hasMemoryEnabled, {
          serviceAvailable: capxMemoryService.isAvailable(),
          userId: userId ? 'provided' : 'missing'
        });
      }
      
      console.log('🎯 Enhanced response sent via normal');
      return response;

    } catch (enhancedError) {
      console.error('❌ Enhanced chat processing failed:', enhancedError);
      
      // Fallback to basic chat
      console.log('⬇️ Falling back to basic chat processing');
      
      // Prepare memory context for fallback
      let fallbackMemoryContext = '';
      if (relevantMemories.length > 0) {
        fallbackMemoryContext = `\n\n**Context from Previous Conversations:**\n${relevantMemories
          .map((memory, index) => `${index + 1}. ${memory.text}`)
          .join('\n')}\n\n`;
      }
      
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

${fallbackMemoryContext}Provide clear, concise, and helpful responses about cryptocurrency topics.`;

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

      const response = result.toDataStreamResponse({
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Content-Type-Options': 'nosniff',
        },
      });

      // Store the conversation in memory for fallback case
      if (hasMemoryEnabled) {
        try {
          console.log('💾 Storing fallback conversation in memory');
          
          // Store the user's query with fallback context
          await capxMemoryService.addMemory(
            userId,
            `User asked: "${latestUserMessage.content}"`,
            {
              source: 'chat_query_fallback',
              timestamp: Date.now(),
              processingType: 'fallback',
            },
            'extract_facts'
          );
          
          console.log('✅ Fallback conversation stored in memory');
        } catch (error) {
          console.error('⚠️ Failed to store fallback conversation in memory:', error);
          // Continue without storing memory if it fails
        }
      }

      return response;
    }

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}