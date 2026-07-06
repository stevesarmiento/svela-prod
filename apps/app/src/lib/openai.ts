import { createOpenAI } from '@ai-sdk/openai'
import { env } from '@/env.mjs'

const apiKey = env.OPENAI_API_KEY

if (!apiKey) {
  console.warn('OPENAI_API_KEY is not set. OpenAI features will be disabled.')
}

export const openai = apiKey ? createOpenAI({
  apiKey,
}) : null

export const isOpenAIAvailable = !!apiKey