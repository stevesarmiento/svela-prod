/**
 * 🛡️ Arma Error Handler - Enterprise-Grade Error Management
 * 
 * Provides comprehensive error classification, retry logic, and recovery strategies
 * for production Solana applications. Handles network failures, rate limiting,
 * transaction errors, and wallet issues with intelligent retry mechanisms.
 */

import { type Address } from '@solana/kit'

// ===== ERROR CLASSIFICATION =====

export enum ArmaErrorCode {
  // Network & RPC Errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  RPC_ERROR = 'RPC_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',
  BLOCKHASH_EXPIRED = 'BLOCKHASH_EXPIRED',
  
  // Wallet Errors
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  WALLET_LOCKED = 'WALLET_LOCKED',
  USER_REJECTED = 'USER_REJECTED',
  
  // Transaction Errors
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  SIMULATION_FAILED = 'SIMULATION_FAILED',
  INVALID_INSTRUCTION = 'INVALID_INSTRUCTION',
  
  // Account Errors
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  ACCOUNT_ALREADY_EXISTS = 'ACCOUNT_ALREADY_EXISTS',
  
  // Token Errors
  TOKEN_ACCOUNT_NOT_FOUND = 'TOKEN_ACCOUNT_NOT_FOUND',
  INSUFFICIENT_TOKEN_BALANCE = 'INSUFFICIENT_TOKEN_BALANCE',
  INVALID_MINT = 'INVALID_MINT',
  TOKEN_FROZEN = 'TOKEN_FROZEN',
  
  // Program Errors
  PROGRAM_ERROR = 'PROGRAM_ERROR',
  CUSTOM_PROGRAM_ERROR = 'CUSTOM_PROGRAM_ERROR',
  
  // System Errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR'
}

export enum ArmaErrorSeverity {
  LOW = 'LOW',           // Minor issues, user can continue
  MEDIUM = 'MEDIUM',     // Significant issues, but recoverable
  HIGH = 'HIGH',         // Critical issues, requires user action
  CRITICAL = 'CRITICAL'  // System failure, requires developer attention
}

export enum ArmaRetryStrategy {
  NONE = 'NONE',                    // Don't retry
  IMMEDIATE = 'IMMEDIATE',          // Retry immediately
  LINEAR_BACKOFF = 'LINEAR_BACKOFF', // Linear delay increase
  EXPONENTIAL_BACKOFF = 'EXPONENTIAL_BACKOFF', // Exponential delay increase
  CUSTOM = 'CUSTOM'                 // Use custom retry function
}

// ===== ERROR INTERFACES =====

export interface ArmaErrorContext {
  operation: string
  address?: Address | string
  signature?: string
  mint?: Address | string
  amount?: bigint | number
  timestamp: number
  userAgent?: string
  network?: string
  rpcUrl?: string
}

export interface ArmaRetryConfig {
  strategy: ArmaRetryStrategy
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  jitter: boolean
  customRetryFn?: (attempt: number, error: ArmaError) => number | false
}

export interface ArmaErrorRecovery {
  canRecover: boolean
  recoveryAction?: () => Promise<void>
  userMessage: string
  developerMessage: string
}

// ===== MAIN ERROR CLASS =====

export class ArmaError extends Error {
  public readonly code: ArmaErrorCode
  public readonly severity: ArmaErrorSeverity
  public readonly context: ArmaErrorContext
  public readonly originalError?: Error
  public readonly retryable: boolean
  public readonly recovery: ArmaErrorRecovery

  constructor(
    message: string,
    code: ArmaErrorCode,
    context: Partial<ArmaErrorContext> = {},
    originalError?: Error
  ) {
    super(message)
    this.name = 'ArmaError'
    this.code = code
    this.originalError = originalError
    
    // Set context with defaults
    this.context = {
      operation: 'unknown',
      timestamp: Date.now(),
      ...context
    }
    
    // Determine severity and retryability
    const classification = this.classifyError(code)
    this.severity = classification.severity
    this.retryable = classification.retryable
    this.recovery = this.buildRecovery(code, message)
    
    // Maintain stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ArmaError)
    }
  }

  private classifyError(code: ArmaErrorCode): { severity: ArmaErrorSeverity; retryable: boolean } {
    switch (code) {
      // Retryable network errors
      case ArmaErrorCode.NETWORK_ERROR:
      case ArmaErrorCode.RPC_ERROR:
      case ArmaErrorCode.TIMEOUT:
        return { severity: ArmaErrorSeverity.MEDIUM, retryable: true }
      
      case ArmaErrorCode.RATE_LIMITED:
        return { severity: ArmaErrorSeverity.LOW, retryable: true }
      
      case ArmaErrorCode.BLOCKHASH_EXPIRED:
        return { severity: ArmaErrorSeverity.LOW, retryable: true }
      
      // Non-retryable wallet errors
      case ArmaErrorCode.WALLET_NOT_CONNECTED:
      case ArmaErrorCode.WALLET_LOCKED:
      case ArmaErrorCode.USER_REJECTED:
        return { severity: ArmaErrorSeverity.HIGH, retryable: false }
      
      // Transaction errors (some retryable)
      case ArmaErrorCode.INSUFFICIENT_FUNDS:
      case ArmaErrorCode.INSUFFICIENT_TOKEN_BALANCE:
        return { severity: ArmaErrorSeverity.HIGH, retryable: false }
      
      case ArmaErrorCode.TRANSACTION_FAILED:
      case ArmaErrorCode.SIMULATION_FAILED:
        return { severity: ArmaErrorSeverity.MEDIUM, retryable: true }
      
      // Account errors (mostly non-retryable)
      case ArmaErrorCode.ACCOUNT_NOT_FOUND:
      case ArmaErrorCode.TOKEN_ACCOUNT_NOT_FOUND:
        return { severity: ArmaErrorSeverity.MEDIUM, retryable: false }
      
      case ArmaErrorCode.INVALID_ADDRESS:
      case ArmaErrorCode.INVALID_MINT:
        return { severity: ArmaErrorSeverity.HIGH, retryable: false }
      
      // System errors
      case ArmaErrorCode.UNKNOWN_ERROR:
        return { severity: ArmaErrorSeverity.CRITICAL, retryable: true }
      
      default:
        return { severity: ArmaErrorSeverity.MEDIUM, retryable: false }
    }
  }

  private buildRecovery(code: ArmaErrorCode, message: string): ArmaErrorRecovery {
    switch (code) {
      case ArmaErrorCode.WALLET_NOT_CONNECTED:
        return {
          canRecover: true,
          userMessage: 'Please connect your wallet to continue.',
          developerMessage: 'Wallet connection required for this operation.'
        }
      
      case ArmaErrorCode.INSUFFICIENT_FUNDS:
        return {
          canRecover: true,
          userMessage: 'Insufficient SOL balance. Please add funds to your wallet.',
          developerMessage: 'Transaction requires more SOL than available in wallet.'
        }
      
      case ArmaErrorCode.RATE_LIMITED:
        return {
          canRecover: true,
          userMessage: 'Request rate limit exceeded. Please wait a moment and try again.',
          developerMessage: 'RPC rate limit hit. Consider implementing backoff or using multiple endpoints.'
        }
      
      case ArmaErrorCode.USER_REJECTED:
        return {
          canRecover: true,
          userMessage: 'Transaction was cancelled.',
          developerMessage: 'User rejected transaction in wallet.'
        }
      
      case ArmaErrorCode.BLOCKHASH_EXPIRED:
        return {
          canRecover: true,
          userMessage: 'Transaction expired. Please try again.',
          developerMessage: 'Blockhash expired, transaction needs to be rebuilt.'
        }
      
      default:
        return {
          canRecover: false,
          userMessage: 'An unexpected error occurred. Please try again.',
          developerMessage: message
        }
    }
  }

  // Utility methods
  public isRetryable(): boolean {
    return this.retryable
  }

  public isCritical(): boolean {
    return this.severity === ArmaErrorSeverity.CRITICAL
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      context: this.context,
      retryable: this.retryable,
      recovery: this.recovery,
      stack: this.stack
    }
  }
}

// ===== ERROR FACTORY FUNCTIONS =====

export const createNetworkError = (message: string, context?: Partial<ArmaErrorContext>, original?: Error) =>
  new ArmaError(message, ArmaErrorCode.NETWORK_ERROR, context, original)

export const createWalletError = (message: string, context?: Partial<ArmaErrorContext>) =>
  new ArmaError(message, ArmaErrorCode.WALLET_NOT_CONNECTED, context)

export const createTransactionError = (message: string, context?: Partial<ArmaErrorContext>, original?: Error) =>
  new ArmaError(message, ArmaErrorCode.TRANSACTION_FAILED, context, original)

export const createInsufficientFundsError = (required: bigint, available: bigint, context?: Partial<ArmaErrorContext>) =>
  new ArmaError(
    `Insufficient funds: required ${required} lamports, available ${available} lamports`,
    ArmaErrorCode.INSUFFICIENT_FUNDS,
    { ...context, amount: required }
  )

export const createRateLimitError = (context?: Partial<ArmaErrorContext>) =>
  new ArmaError('Rate limit exceeded', ArmaErrorCode.RATE_LIMITED, context)

// ===== RETRY MANAGER =====

export class ArmaRetryManager {
  private defaultConfig: ArmaRetryConfig = {
    strategy: ArmaRetryStrategy.EXPONENTIAL_BACKOFF,
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    jitter: true
  }

  constructor(private config: Partial<ArmaRetryConfig> = {}) {
    this.config = { ...this.defaultConfig, ...config }
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: Partial<ArmaErrorContext> = {},
    customConfig?: Partial<ArmaRetryConfig>
  ): Promise<T> {
    const retryConfig = { ...this.config, ...customConfig }
    let lastError: ArmaError | undefined
    let attempt = 0

    while (attempt < retryConfig.maxAttempts!) {
      try {
        return await operation()
      } catch (error) {
        attempt++
        lastError = this.normalizeError(error, context)

        // Don't retry if error is not retryable
        if (!lastError.isRetryable()) {
          throw lastError
        }

        // Don't retry if we've reached max attempts
        if (attempt >= retryConfig.maxAttempts!) {
          throw lastError
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt, retryConfig as ArmaRetryConfig, lastError)
        if (delay === false) {
          throw lastError
        }

        console.warn(`[Arc] Operation failed (attempt ${attempt}/${retryConfig.maxAttempts}), retrying in ${delay}ms:`, lastError.message)
        await this.sleep(delay)
      }
    }

    throw lastError!
  }

  private normalizeError(error: unknown, context: Partial<ArmaErrorContext>): ArmaError {
    if (error instanceof ArmaError) {
      return error
    }

    if (error instanceof Error) {
      // Classify common error types
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        return createRateLimitError(context)
      }
      
      if (error.message.includes('network') || error.message.includes('fetch')) {
        return createNetworkError(error.message, context, error)
      }
      
      if (error.message.includes('insufficient funds')) {
        return new ArmaError(error.message, ArmaErrorCode.INSUFFICIENT_FUNDS, context, error)
      }
      
      if (error.message.includes('user rejected') || error.message.includes('cancelled')) {
        return new ArmaError(error.message, ArmaErrorCode.USER_REJECTED, context, error)
      }

      return new ArmaError(error.message, ArmaErrorCode.UNKNOWN_ERROR, context, error)
    }

    return new ArmaError(
      'Unknown error occurred',
      ArmaErrorCode.UNKNOWN_ERROR,
      context,
      error instanceof Error ? error : new Error(String(error))
    )
  }

  private calculateDelay(
    attempt: number,
    config: ArmaRetryConfig,
    error: ArmaError
  ): number | false {
    switch (config.strategy) {
      case ArmaRetryStrategy.NONE:
        return false
      
      case ArmaRetryStrategy.IMMEDIATE:
        return 0
      
      case ArmaRetryStrategy.LINEAR_BACKOFF:
        let linearDelay = config.baseDelay! * attempt
        break
      
      case ArmaRetryStrategy.EXPONENTIAL_BACKOFF:
        let exponentialDelay = config.baseDelay! * Math.pow(2, attempt - 1)
        break
      
      case ArmaRetryStrategy.CUSTOM:
        if (config.customRetryFn) {
          return config.customRetryFn(attempt, error)
        }
        return false
      
      default:
        let defaultDelay = config.baseDelay!
    }

    // Apply delay calculation
    let delay: number
    switch (config.strategy) {
      case ArmaRetryStrategy.LINEAR_BACKOFF:
        delay = config.baseDelay! * attempt
        break
      case ArmaRetryStrategy.EXPONENTIAL_BACKOFF:
        delay = config.baseDelay! * Math.pow(2, attempt - 1)
        break
      default:
        delay = config.baseDelay!
    }

    // Apply jitter if enabled
    if (config.jitter) {
      delay *= (0.5 + Math.random() * 0.5) // Random between 50% and 100% of calculated delay
    }

    // Cap at max delay
    return Math.min(delay, config.maxDelay!)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ===== GLOBAL RETRY MANAGER =====

export const defaultRetryManager = new ArmaRetryManager()

// ===== UTILITY FUNCTIONS =====

export const isArmaError = (error: unknown): error is ArmaError => {
  return error instanceof ArmaError
}

export const classifyError = (error: unknown): ArmaErrorCode => {
  if (isArmaError(error)) {
    return error.code
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    
    if (message.includes('network') || message.includes('fetch')) {
      return ArmaErrorCode.NETWORK_ERROR
    }
    if (message.includes('rate limit') || message.includes('429')) {
      return ArmaErrorCode.RATE_LIMITED
    }
    if (message.includes('insufficient')) {
      return ArmaErrorCode.INSUFFICIENT_FUNDS
    }
    if (message.includes('user rejected') || message.includes('cancelled')) {
      return ArmaErrorCode.USER_REJECTED
    }
  }
  
  return ArmaErrorCode.UNKNOWN_ERROR
}

export const formatErrorForUser = (error: unknown): string => {
  if (isArmaError(error)) {
    return error.recovery.userMessage
  }
  
  if (error instanceof Error) {
    // Provide user-friendly messages for common errors
    const message = error.message.toLowerCase()
    if (message.includes('network')) {
      return 'Network connection issue. Please check your internet and try again.'
    }
    if (message.includes('insufficient')) {
      return 'Insufficient balance for this transaction.'
    }
    if (message.includes('user rejected')) {
      return 'Transaction was cancelled.'
    }
  }
  
  return 'An unexpected error occurred. Please try again.'
}