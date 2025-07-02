import { createGoogleGenerativeAI } from '@ai-sdk/google'

const apiKey = process.env.GEMINI_API_KEY

if (!apiKey) {
  console.warn('GEMINI_API_KEY is not set. Gemini features will be disabled.')
}

export const gemini = apiKey ? createGoogleGenerativeAI({
  apiKey,
}) : null

export const isGeminiAvailable = !!apiKey 