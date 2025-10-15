/**
 * Titan WebSocket Client
 * Manages WebSocket connections with MessagePack encoding
 */

import { encode, decode } from '@msgpack/msgpack'
import type {
  ClientRequest,
  ServerMessage,
  ServerInfo,
  SwapQuotes,
  StreamEnd,
} from './types.js'

export interface TitanClientConfig {
  apiUrl?: string
  apiKey: string
  compression?: 'zstd' | 'brotli' | 'gzip' | 'none'
  debug?: boolean
  reconnectAttempts?: number
  reconnectDelayMs?: number
}

interface PendingRequest {
  resolve: (data: any) => void
  reject: (error: Error) => void
  streamCallback?: (data: SwapQuotes) => void
}

export class TitanClient {
  private ws: WebSocket | null = null
  private config: Required<TitanClientConfig>
  private requestId = 0
  private pendingRequests = new Map<number, PendingRequest>()
  private activeStreams = new Map<number, (data: SwapQuotes) => void>()
  private serverInfo: ServerInfo | null = null
  private connecting: Promise<void> | null = null
  private reconnectAttempt = 0

  constructor(config: TitanClientConfig) {
    this.config = {
      apiUrl: config.apiUrl || 'wss://api.titan.ag/api/v1/ws',
      apiKey: config.apiKey,
      compression: config.compression || 'none',
      debug: config.debug || false,
      reconnectAttempts: config.reconnectAttempts || 3,
      reconnectDelayMs: config.reconnectDelayMs || 1000,
    }
  }

  private log(...args: any[]) {
    if (this.config.debug) {
      console.log('[TitanClient]', ...args)
    }
  }

  private getProtocol(): string {
    const base = 'v1.api.titan.ag'
    if (this.config.compression === 'none') {
      return base
    }
    return `${base}+${this.config.compression}`
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    if (this.connecting) {
      return this.connecting
    }

    this.connecting = this._connect()
    try {
      await this.connecting
    } finally {
      this.connecting = null
    }
  }

  private async _connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(this.config.apiUrl)

        this.log('Connecting to', url.toString())

        // Use protocol in Sec-WebSocket-Protocol header
        const protocol = this.getProtocol()

        const ws = new WebSocket(url.toString(), protocol)
        ws.binaryType = 'arraybuffer'

        ws.addEventListener('open', () => {
          this.log('Connected')
          this.ws = ws
          this.reconnectAttempt = 0

          // Send authentication as first message
          try {
            const authMessage = encode({
              Authenticate: {
                apiKey: this.config.apiKey
              }
            })
            ws.send(authMessage)
            this.log('Sent authentication message')
          } catch (error) {
            this.log('Failed to send auth message:', error)
            reject(error)
            return
          }

          resolve()
        })

        ws.addEventListener('message', (event: MessageEvent) => {
          this.handleMessage(event.data)
        })

        ws.addEventListener('error', (error) => {
          this.log('WebSocket error:', error)
          reject(error)
        })

        ws.addEventListener('close', (event) => {
          this.log('Connection closed:', event.code, event.reason)
          this.ws = null
          this.handleDisconnect()
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  private handleMessage(data: ArrayBuffer) {
    try {
      const message = decode(new Uint8Array(data)) as ServerMessage

      if ('Response' in message) {
        const response = message.Response
        const pending = this.pendingRequests.get(response.requestId)

        if (pending) {
          this.pendingRequests.delete(response.requestId)

          // If this response starts a stream, store the callback
          if (response.stream && pending.streamCallback) {
            this.activeStreams.set(response.stream.id, pending.streamCallback)
          }

          pending.resolve(response.data)
        }
      } else if ('Error' in message) {
        const error = message.Error
        const pending = this.pendingRequests.get(error.requestId)

        if (pending) {
          this.pendingRequests.delete(error.requestId)
          pending.reject(new Error(`[${error.code}] ${error.message}`))
        }
      } else if ('StreamData' in message) {
        const streamData = message.StreamData
        const callback = this.activeStreams.get(streamData.id)

        if (callback && 'SwapQuotes' in streamData.payload) {
          callback(streamData.payload.SwapQuotes)
        }
      } else if ('StreamEnd' in message) {
        const streamEnd = message.StreamEnd as StreamEnd
        this.activeStreams.delete(streamEnd.id)

        if (streamEnd.errorCode) {
          this.log('Stream ended with error:', streamEnd.errorMessage)
        }
      }
    } catch (error) {
      this.log('Error handling message:', error)
    }
  }

  private handleDisconnect() {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error('WebSocket disconnected'))
      this.pendingRequests.delete(id)
    }

    // Clear active streams
    this.activeStreams.clear()

    // Attempt reconnection
    if (this.reconnectAttempt < this.config.reconnectAttempts) {
      this.reconnectAttempt++
      const delay = this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempt - 1)
      this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`)

      setTimeout(() => {
        this.connect().catch((error) => {
          this.log('Reconnection failed:', error)
        })
      }, delay)
    }
  }

  async request<T>(data: ClientRequest['data'], streamCallback?: (data: SwapQuotes) => void): Promise<T> {
    await this.connect()

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const id = ++this.requestId
    const request: ClientRequest = { id, data }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, streamCallback })

      try {
        const encoded = encode(request)
        this.ws!.send(encoded)
        this.log('Sent request', id, Object.keys(data)[0])
      } catch (error) {
        this.pendingRequests.delete(id)
        reject(error)
      }
    })
  }

  async getInfo(): Promise<ServerInfo> {
    if (this.serverInfo) {
      return this.serverInfo
    }

    const response = await this.request<{ GetInfo: ServerInfo }>({ GetInfo: {} })

    if ('GetInfo' in response) {
      this.serverInfo = response.GetInfo
      return this.serverInfo
    }

    throw new Error('Invalid GetInfo response')
  }

  async stopStream(streamId: number): Promise<void> {
    await this.request({ StopStream: { id: streamId } })
    this.activeStreams.delete(streamId)
  }

  close() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.pendingRequests.clear()
    this.activeStreams.clear()
  }
}
