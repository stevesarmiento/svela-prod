export const API_PROVIDERS = {
  coingecko: {
    name: "CoinGecko Pro",
    description: "Premium cryptocurrency market data and pricing",
    keyPattern: /^.{10,}$/,
    testEndpoint: "https://pro-api.coingecko.com/api/v3/ping",
    rateLimit: { requests: 500, window: 60_000 },
  },
  coinglass: {
    name: "CoinGlass",
    description: "Derivatives and futures market data",
    keyPattern: /^.{10,}$/,
    testEndpoint: "https://fapi.coinglass.com/api/futures/supported-coins",
    rateLimit: { requests: 1_000, window: 60_000 },
  },
  openai: {
    name: "OpenAI",
    description: "AI-powered analysis and chat features",
    keyPattern: /^.{10,}$/,
    testEndpoint: "https://api.openai.com/v1/models",
    rateLimit: { requests: 3_500, window: 60_000 },
  },
  gemini: {
    name: "Google Gemini",
    description: "Google's AI model for analysis and chat",
    keyPattern: /^.{10,}$/,
    testEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    rateLimit: { requests: 60, window: 60_000 },
  },
} as const;

export type ApiProvider = keyof typeof API_PROVIDERS;

