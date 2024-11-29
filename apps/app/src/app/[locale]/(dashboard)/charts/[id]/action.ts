"use server";

import { OpenAIStream, StreamingTextResponse } from 'ai';
import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Updated schema for CoinMarketCap data
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
});

export async function generateAnalysis(tokenData: z.infer<typeof TokenDataSchema>) {
  try {
    const validatedData = TokenDataSchema.parse(tokenData);

    const prompt = `
      Analyze the following cryptocurrency data and provide insights:
      Name: ${validatedData.name}
      Current Price: $${validatedData.quote.USD.price.toLocaleString()}
      24h Change: ${validatedData.quote.USD.percent_change_24h.toFixed(2)}%
      Market Cap: $${validatedData.quote.USD.market_cap.toLocaleString()}
      24h Volume: $${validatedData.quote.USD.volume_24h.toLocaleString()}
      
      Please provide a detailed analysis in the following format:
      1. Key strengths (2-3 sentences)
      2. Current challenges (2-3 sentences)
      3. Market outlook (2-3 sentences)
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      stream: true,
    });

    const stream = OpenAIStream(response);
    return new StreamingTextResponse(stream);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid token data: ${error.message}`);
    }
    throw new Error('Failed to generate analysis');
  }
}