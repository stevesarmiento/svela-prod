import { createXai } from '@ai-sdk/xai'

const apiKey = process.env.XAI_API_KEY

if (!apiKey) {
  console.warn('XAI_API_KEY is not set. Grok features will be disabled.')
}

export const grok = apiKey ? createXai({
  apiKey,
}) : null

export const isGrokAvailable = !!apiKey 