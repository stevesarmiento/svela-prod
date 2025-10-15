import { NextResponse } from 'next/server'

// Import from built package - these types/classes aren't exported, so we'll need to create them here
import type { SwapQuotes } from '@armadura/titan'

// We need to implement a Node.js WebSocket client here since the package doesn't export TitanClient
import WebSocket from 'ws'
import { encode, decode } from '@msgpack/msgpack'

interface SwapQuoteRequest {
  swap: {
    inputMint: string
    outputMint: string
    amount: string
    slippageBps: number
    onlyDirectRoutes?: boolean
    excludeDexes?: string[]
    providers?: string[]
    addSizeConstraint?: boolean
    sizeConstraint?: number
    accountsLimitTotal?: number
    accountsLimitWritable?: number
  }
  transaction: {
    userPublicKey: string
    closeInputTokenAccount?: boolean
    createOutputTokenAccount?: boolean
    feeBps?: number
  }
  update?: {
    intervalMs?: number
    numQuotes?: number
  }
}

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { inputMint, outputMint, amount, slippageBps, userPublicKey } = body

    if (!inputMint || !outputMint || !amount) {
      return NextResponse.json(
        { error: 'Missing required parameters: inputMint, outputMint, amount' },
        { status: 400 }
      )
    }

    // Get API key from environment
    const apiKey = process.env.TITAN_API_KEY
    if (!apiKey) {
      console.error('TITAN_API_KEY not configured')
      return NextResponse.json(
        { error: 'Titan API key not configured' },
        { status: 500 }
      )
    }

    console.log('[Titan API] Creating WebSocket connection for quote request')

    // Create WebSocket connection to Titan with proper SNI
    // Per the ws library docs, pass protocols array and TLS options
    const ws = new WebSocket('wss://api.titan.ag/api/v1/ws', ['v1.api.titan.ag'], {
      servername: 'api.titan.ag',
    })

    try {
      // Wait for connection to open
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          console.log('[Titan API] WebSocket connected')
          resolve()
        })
        ws.on('error', (error) => {
          console.error('[Titan API] WebSocket connection error:', error)
          reject(error)
        })

        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      })

      // Send authentication message
      const authMessage = encode({
        Authenticate: {
          apiKey: apiKey
        }
      })
      ws.send(authMessage)
      console.log('[Titan API] Sent authentication message')

      // Prepare swap quote request
      const request: SwapQuoteRequest = {
        swap: {
          inputMint,
          outputMint,
          amount: amount.toString(),
          slippageBps: slippageBps ?? 50,
        },
        transaction: {
          userPublicKey: userPublicKey || '11111111111111111111111111111111',
        },
        update: {
          intervalMs: 1000,
          numQuotes: 1, // Just get one quote for REST endpoint
        },
      }

      console.log('[Titan API] Requesting quote:', {
        inputMint,
        outputMint,
        amount,
        slippageBps: request.swap.slippageBps,
      })

      // Send quote request
      const requestId = 1
      const requestMessage = encode({
        id: requestId,
        data: { NewSwapQuoteStream: request }
      })
      ws.send(requestMessage)

      // Wait for quote response
      const quotes = await new Promise<SwapQuotes>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error('[Titan API] Quote request timed out')
          reject(new Error('Quote request timed out'))
        }, 15000)

        ws.on('message', (data: Buffer) => {
          try {
            const message = decode(data) as any

            if ('Response' in message) {
              const response = message.Response
              console.log('[Titan API] Received response:', response)
            } else if ('StreamData' in message) {
              const streamData = message.StreamData
              if ('SwapQuotes' in streamData.payload) {
                console.log('[Titan API] Received quotes:', Object.keys(streamData.payload.SwapQuotes.quotes))
                clearTimeout(timeout)
                resolve(streamData.payload.SwapQuotes)
                ws.close()
              }
            } else if ('Error' in message) {
              const error = message.Error
              console.error('[Titan API] Received error:', error)
              clearTimeout(timeout)
              reject(new Error(`[${error.code}] ${error.message}`))
              ws.close()
            }
          } catch (error) {
            console.error('[Titan API] Error handling message:', error)
          }
        })

        ws.on('error', (error) => {
          console.error('[Titan API] WebSocket error during quote request:', error)
          clearTimeout(timeout)
          reject(error)
        })

        ws.on('close', (code, reason) => {
          console.log('[Titan API] WebSocket closed:', code, reason.toString())
          if (code !== 1000) {
            clearTimeout(timeout)
            reject(new Error(`WebSocket closed with code ${code}: ${reason.toString()}`))
          }
        })
      })

      console.log('[Titan API] Successfully received quotes from', Object.keys(quotes.quotes).length, 'providers')

      return NextResponse.json(quotes)
    } finally {
      // Ensure WebSocket is closed
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }
  } catch (error) {
    console.error('[Titan API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch quote' },
      { status: 500 }
    )
  }
}
