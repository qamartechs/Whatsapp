/**
 * Secure environment variable configuration
 * Validates and provides safe access to critical environment variables
 */

export interface EnvironmentConfig {
  supabase: {
    url: string
    anonKey: string
    serviceRoleKey: string
  }
  whatsapp?: {
    businessPhoneNumberId?: string
    businessPhoneNumberToken?: string
  }
}

/**
 * Validates and returns environment configuration
 * Throws error if critical variables are missing
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const errors: string[] = []

  // Validate Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL')
  }
  if (!supabaseAnonKey) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  if (!supabaseServiceRoleKey) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY')
  }

  if (errors.length > 0) {
    throw new Error(
      `Missing critical environment variables: ${errors.join(', ')}. ` +
      `Please ensure your .env.local or Vercel project settings are configured correctly. ` +
      `Visit https://supabase.com/dashboard/project/_/settings/api to find these values.`
    )
  }

  return {
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: supabaseServiceRoleKey,
    },
    whatsapp: {
      businessPhoneNumberId: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID,
      businessPhoneNumberToken: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_TOKEN,
    },
  }
}

/**
 * Safely gets a single environment variable
 * Returns undefined if not set, throws if marked as required and missing
 */
export function getEnv(
  key: string,
  options?: { required?: boolean; defaultValue?: string }
): string | undefined {
  const value = process.env[key]

  if (!value && options?.required) {
    throw new Error(
      `Required environment variable not set: ${key}. ` +
      `Please check your .env.local or Vercel project settings.`
    )
  }

  return value || options?.defaultValue
}

/**
 * Validates that critical environment variables are set
 * Use in API route handlers to fail fast if configuration is incomplete
 */
export function requireEnvironmentVariables(...keys: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  const missing: string[] = []

  for (const key of keys) {
    const value = process.env[key]
    if (!value) {
      missing.push(key)
    } else {
      result[key] = value
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `Please check your configuration.`
    )
  }

  return result
}

/**
 * Checks if all critical environment variables are configured
 * Use for health checks or startup validation
 */
export function areEnvironmentVariablesConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}
