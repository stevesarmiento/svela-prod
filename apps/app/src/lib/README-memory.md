# Memory Integration with Cap.X API

This project integrates with Cap.X API to provide intelligent long-term memory for chat conversations.

## Features

- **Automatic Memory Storage**: Stores user queries and AI responses for future context
- **Semantic Memory Retrieval**: Retrieves relevant memories based on semantic similarity
- **Memory Management**: Provides cleanup utilities for data privacy and cost management
- **Graceful Degradation**: Works with or without memory service configured

## Setup

1. Sign up for Cap.X API at [https://capi.dev](https://capi.dev)
2. Get your API key from the dashboard
3. Add the API key to your environment variables:
   ```
   X_CAPI_API_KEY=your_api_key_here
   ```

## Usage

### Chat with Memory

The chat API automatically handles memory:

```javascript
// Send a chat request with userId to enable memory
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'What is Bitcoin?' }
    ],
    userId: 'user-123' // Required for memory functionality
  })
});
```

### Memory Cleanup

Use the cleanup API to manage user memories:

```javascript
// Clean up memories older than 30 days
const cleanup = await fetch('/api/memory/cleanup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-123',
    action: 'cleanup_old',
    days: 30
  })
});

// Clean up temporary session data
const sessionCleanup = await fetch('/api/memory/cleanup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-123',
    action: 'cleanup_session'
  })
});
```

## How It Works

1. **Memory Retrieval**: Before processing a chat, the system retrieves up to 5 relevant memories based on semantic similarity
2. **Context Integration**: Retrieved memories are included in the AI's context for more informed responses
3. **Memory Storage**: After processing, both the user query and AI response are stored with metadata
4. **Fallback Support**: If memory service fails, the chat continues without memory

## Memory Strategies

- **extract_facts**: For user queries - extracts key facts and preferences
- **summarize_if_long**: For AI responses - summarizes long responses to save storage
- **raw**: For precise, short content that should be stored as-is

## Metadata Structure

Memories are stored with metadata for filtering and analytics:

```javascript
{
  source: 'chat_query' | 'chat_response' | 'chat_query_fallback',
  timestamp: Date.now(),
  intentType: 'price_inquiry' | 'analysis' | 'general',
  dataQuality: 'high' | 'medium' | 'low',
  dataSources: ['coingecko', 'coinmarketcap'],
  processingType: 'enhanced' | 'fallback'
}
```

## Best Practices

1. **User Privacy**: Implement regular memory cleanup for inactive users
2. **Cost Management**: Use appropriate storage strategies and cleanup old memories
3. **Error Handling**: Memory failures don't break the chat experience
4. **User Control**: Allow users to manage their own memory preferences

## Environment Variables

Make sure to add the following to your `.env.local`:

```
X_CAPI_API_KEY=your_cap_x_api_key_here
```

## Service Methods

The `capxMemoryService` provides these methods:

- `addMemory(userId, text, metadata, strategy)` - Store a memory
- `retrieveContext(userId, query, limit, metadataFilter)` - Retrieve relevant memories
- `forgetMemory(userId, options)` - Remove specific memories
- `cleanupOldMemories(userId, days)` - Clean up old memories
- `cleanupSessionData(userId)` - Clean up temporary session data
- `isAvailable()` - Check if service is configured

## Error Handling

The service handles errors gracefully:
- Missing API key: Service is disabled, chat works without memory
- API failures: Logged but don't break the chat experience
- Rate limiting: Implements retry logic with exponential backoff (recommended by Cap.X)

## Security Notes

- Never expose your API key in client-side code
- All API calls go through secure backend endpoints
- User IDs should be your internal identifiers, not sensitive data 