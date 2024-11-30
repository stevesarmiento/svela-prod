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
    const json = await req.json()
    console.log('Analyze Route - Received data:', json)
    
    const validatedData = TokenDataSchema.parse(json)

    const prompt = `
        Analyze the following cryptocurrency data and provide insights:
        Name: ${validatedData.name}
        Current Price: $${validatedData.quote.USD.price.toLocaleString()}
        24h Change: ${validatedData.quote.USD.percent_change_24h.toFixed(2)}%
        Market Cap: $${formatLargeNumber(validatedData.quote.USD.market_cap)}
        24h Volume: $${formatLargeNumber(validatedData.quote.USD.volume_24h)}
        
        Please provide a detailed analysis in exactly this format with exactly two newlines between each section:

        Strengths:
        (2-3 sentences about key strengths)


        Challenges:
        (2-3 sentences about current challenges)


        Market outlook:
        (2-3 sentences about market outlook)
    `

    const model = openai.chat('gpt-4-turbo-preview')

    const stream = await streamText({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxSteps: 1,
    })

    return stream.toTextStreamResponse({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('Analysis error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to generate analysis' }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}