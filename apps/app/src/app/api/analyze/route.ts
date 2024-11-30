import { streamText } from 'ai'
import { z } from 'zod'
import { openai } from '@/lib/openai'
import { formatLargeNumber } from '@v1/ui/format-numbers'

const TokenDataSchema = z.object({
  name: z.string(),
  quote: z.object({
    USD: z.object({
      price: z.number(),
      percent_change_24h: z.number(),
      market_cap: z.number(),
      volume_24h: z.number(),
    }),
  }),
})

export async function POST(req: Request) {
  try {
    const rawData = await req.text()
    let data
    
    try {
      const parsed = JSON.parse(rawData)
      data = parsed.prompt ? JSON.parse(parsed.prompt) : parsed
    } catch (e) {
      console.error('JSON parse error:', e)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON data' }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const validatedData = TokenDataSchema.parse(data)

    const prompt = `
      Analyze the following cryptocurrency data and provide insights:
      Name: ${validatedData.name}
      Current Price: $${validatedData.quote.USD.price.toLocaleString()}
      24h Change: ${validatedData.quote.USD.percent_change_24h.toFixed(2)}%
      Market Cap: $${formatLargeNumber(validatedData.quote.USD.market_cap)}
      24h Volume: $${formatLargeNumber(validatedData.quote.USD.volume_24h)}
      
      Provide a concise analysis in the following format:
      
      Strengths:
      [Key strengths analysis in 2-3 sentences]
      
      Challenges:
      [Current challenges analysis in 2-3 sentences]
      
      Market outlook:
      [Market outlook analysis in 2-3 sentences]
    `.trim()

    const result = await streamText({
      model: openai.chat('gpt-3.5-turbo'),
      messages: [{ 
        role: 'user', 
        content: prompt 
      }],
      temperature: 0.7,
      maxTokens: 500,
    //   onChunk: ({ chunk }) => {
    //     if (chunk.type === 'text-delta') {
    //       console.log('Streaming chunk:', chunk.textDelta)
    //     }
    //   },
      onFinish: ({ text }) => {
        console.log('Final text:', text)
      }
    })

    return result.toDataStreamResponse({
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Content-Type-Options': 'nosniff'
        }
      })
  } catch (error) {
    console.error('Analysis error:', error)
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid data format',
          details: error.errors 
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    return new Response(
      JSON.stringify({ error: 'Failed to generate analysis' }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}