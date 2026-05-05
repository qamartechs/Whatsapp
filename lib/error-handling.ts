/**
 * Centralized error handling and logging utilities
 * Provides consistent error handling patterns across the application
 */

export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info'

export interface LogEntry {
  timestamp: string
  severity: ErrorSeverity
  context: string
  message: string
  error?: Error
  data?: Record<string, unknown>
}

/**
 * Centralized logger with structured format
 */
export class Logger {
  private context: string

  constructor(context: string) {
    this.context = context
  }

  private formatLog(severity: ErrorSeverity, message: string, error?: Error, data?: Record<string, unknown>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      severity,
      context: this.context,
      message,
      error,
      data,
    }
  }

  critical(message: string, error?: Error, data?: Record<string, unknown>) {
    const log = this.formatLog('critical', message, error, data)
    console.error(`[${log.context}] CRITICAL: ${message}`, error, data)
    return log
  }

  error(message: string, error?: Error, data?: Record<string, unknown>) {
    const log = this.formatLog('error', message, error, data)
    console.error(`[${log.context}] ERROR: ${message}`, error, data)
    return log
  }

  warning(message: string, data?: Record<string, unknown>) {
    const log = this.formatLog('warning', message, undefined, data)
    console.warn(`[${log.context}] WARNING: ${message}`, data)
    return log
  }

  info(message: string, data?: Record<string, unknown>) {
    const log = this.formatLog('info', message, undefined, data)
    console.log(`[${log.context}] INFO: ${message}`, data)
    return log
  }

  debug(message: string, data?: Record<string, unknown>) {
    if (process.env.DEBUG === 'true') {
      console.debug(`[${this.context}] DEBUG: ${message}`, data)
    }
  }
}

/**
 * Standardized error response for API routes
 */
export function createErrorResponse(
  statusCode: number,
  message: string,
  details?: Record<string, unknown>
) {
  return {
    status: statusCode,
    body: {
      error: message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
    },
  }
}

/**
 * Wraps async operations with error handling
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  errorContext: string,
  logger?: Logger
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const data = await fn()
    return { success: true, data }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger?.error(`${errorContext} - ${errorMessage}`, err instanceof Error ? err : undefined)
    return { success: false, error: errorMessage }
  }
}

/**
 * Type guard for Error objects
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error
}

/**
 * Extracts meaningful error message from various error types
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message)
  }

  return 'An unknown error occurred'
}

/**
 * Parses Supabase errors into user-friendly messages
 */
export function parseSupabaseError(error: unknown): { statusCode: number; message: string } {
  if (!isError(error)) {
    return { statusCode: 500, message: 'An unexpected error occurred' }
  }

  const message = error.message.toLowerCase()

  // Handle specific Supabase error codes
  if (message.includes('pgrst116') || message.includes('no rows')) {
    return { statusCode: 404, message: 'Resource not found' }
  }

  if (message.includes('23505') || message.includes('duplicate')) {
    return { statusCode: 409, message: 'Resource already exists' }
  }

  if (message.includes('23502') || message.includes('not null')) {
    return { statusCode: 400, message: 'Missing required field' }
  }

  if (message.includes('authentication') || message.includes('unauthorized')) {
    return { statusCode: 401, message: 'Authentication failed' }
  }

  if (message.includes('permission') || message.includes('forbidden')) {
    return { statusCode: 403, message: 'You do not have permission to perform this action' }
  }

  // Default error
  return { statusCode: 500, message: 'Database operation failed' }
}

/**
 * Validates that an operation completed successfully with meaningful error messages
 */
export function validateOperationResult<T extends { error?: Error | null; data?: unknown }>(
  result: T,
  operationName: string,
  logger?: Logger
): { success: boolean; error?: string } {
  if (result.error) {
    const errorMessage = extractErrorMessage(result.error)
    logger?.error(`${operationName} failed: ${errorMessage}`, result.error as Error)
    return { success: false, error: errorMessage }
  }

  if (result.data === null || result.data === undefined) {
    const message = `${operationName} returned no data`
    logger?.warning(message)
    return { success: false, error: message }
  }

  return { success: true }
}
