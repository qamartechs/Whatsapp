import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { AiProvider, Profile } from "@/lib/types"

/**
 * API key configuration for each provider
 * Keys are fetched from the user's profile in the database
 */
export interface ApiKeys {
  openai?: string | null
  anthropic?: string | null
  google?: string | null
  deepseek?: string | null
}

/**
 * Extracts API keys from a user profile
 */
export function getApiKeysFromProfile(profile: Partial<Profile>): ApiKeys {
  return {
    openai: profile.openai_api_key,
    anthropic: profile.anthropic_api_key,
    google: profile.google_api_key,
    deepseek: profile.deepseek_api_key,
  }
}

/**
 * Checks if an API key is available for a provider
 */
export function isProviderAvailable(provider: AiProvider, apiKeys: ApiKeys): boolean {
  switch (provider) {
    case "openai":
      return !!apiKeys.openai
    case "anthropic":
      return !!apiKeys.anthropic
    case "google":
      return !!apiKeys.google
    case "deepseek":
      return !!apiKeys.deepseek
    default:
      return false
  }
}

/**
 * Gets available providers based on configured API keys
 */
export function getAvailableProviders(apiKeys: ApiKeys): AiProvider[] {
  const providers: AiProvider[] = []
  if (apiKeys.openai) providers.push("openai")
  if (apiKeys.google) providers.push("google")
  if (apiKeys.anthropic) providers.push("anthropic")
  if (apiKeys.deepseek) providers.push("deepseek")
  return providers
}

/**
 * Creates a provider model instance based on the provider type and API key
 */
function createProviderModel(provider: AiProvider, model: string, apiKeys: ApiKeys) {
  switch (provider) {
    case "openai": {
      if (!apiKeys.openai) throw new Error("OpenAI API key not configured. Please add it in Settings.")
      const openai = createOpenAI({ apiKey: apiKeys.openai })
      return openai(model)
    }
    case "anthropic": {
      if (!apiKeys.anthropic) throw new Error("Anthropic API key not configured. Please add it in Settings.")
      const anthropic = createAnthropic({ apiKey: apiKeys.anthropic })
      return anthropic(model)
    }
    case "google": {
      if (!apiKeys.google) throw new Error("Google AI API key not configured. Please add it in Settings.")
      const google = createGoogleGenerativeAI({ apiKey: apiKeys.google })
      return google(model)
    }
    case "deepseek": {
      if (!apiKeys.deepseek) throw new Error("DeepSeek API key not configured. Please add it in Settings.")
      // DeepSeek uses OpenAI-compatible API
      const deepseek = createOpenAI({ 
        apiKey: apiKeys.deepseek,
        baseURL: "https://api.deepseek.com/v1",
      })
      return deepseek(model)
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}

/**
 * Generates an AI response using the specified provider and model
 * API keys are fetched from the user's profile
 */
export async function generateAiResponse(
  provider: AiProvider,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  apiKeys: ApiKeys,
  temperature: number = 0.7,
  maxTokens: number = 500
): Promise<string> {
  console.log("[AI] Generating response:", { 
    provider, 
    model, 
    hasApiKey: isProviderAvailable(provider, apiKeys),
    systemPrompt: systemPrompt?.slice(0, 50), 
    userPrompt: userPrompt?.slice(0, 50),
  })
  
  if (!isProviderAvailable(provider, apiKeys)) {
    throw new Error(`${provider} API key not configured. Please add it in Settings.`)
  }
  
  try {
    const providerModel = createProviderModel(provider, model, apiKeys)
    
    const result = await generateText({
      model: providerModel,
      system: systemPrompt,
      prompt: userPrompt,
      temperature,
      maxOutputTokens: maxTokens,
    })

    console.log("[AI] Generated response successfully:", result.text?.slice(0, 100))
    return result.text
  } catch (error) {
    console.error("[AI] Generation error:", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Unknown",
      provider,
      model,
    })
    throw error
  }
}

/**
 * Get the first available provider for utility functions
 */
function getFirstAvailableProvider(apiKeys: ApiKeys): { provider: AiProvider; model: ReturnType<typeof createProviderModel> } | null {
  // Prefer cheaper providers first
  if (apiKeys.deepseek) return { provider: "deepseek", model: createProviderModel("deepseek", "deepseek-chat", apiKeys) }
  if (apiKeys.google) return { provider: "google", model: createProviderModel("google", "gemini-1.5-flash", apiKeys) }
  if (apiKeys.openai) return { provider: "openai", model: createProviderModel("openai", "gpt-4o-mini", apiKeys) }
  if (apiKeys.anthropic) return { provider: "anthropic", model: createProviderModel("anthropic", "claude-3-haiku-20240307", apiKeys) }
  return null
}

/**
 * Generates a response for intent classification
 */
export async function classifyIntent(
  userMessage: string,
  intents: string[],
  apiKeys: ApiKeys
): Promise<string | null> {
  const available = getFirstAvailableProvider(apiKeys)
  if (!available) {
    console.error("[AI] No AI provider configured for intent classification")
    return null
  }

  const systemPrompt = `You are an intent classifier. Given a user message, classify it into one of the following intents: ${intents.join(", ")}.
  
Only respond with the intent name, nothing else. If no intent matches, respond with "unknown".`

  try {
    const result = await generateText({
      model: available.model,
      system: systemPrompt,
      prompt: userMessage,
      temperature: 0,
      maxOutputTokens: 50,
    })

    const intent = result.text.trim().toLowerCase()
    return intents.includes(intent) ? intent : null
  } catch (error) {
    console.error("[AI] Intent classification error:", error)
    return null
  }
}

/**
 * Generates a natural language response for common scenarios
 */
export async function generateSmartReply(
  context: {
    contactName: string
    previousMessages: Array<{ role: "user" | "assistant"; content: string }>
    businessContext?: string
  },
  userMessage: string,
  apiKeys: ApiKeys
): Promise<string> {
  const available = getFirstAvailableProvider(apiKeys)
  if (!available) {
    return "I apologize, but AI is not configured. Please add API keys in Settings."
  }

  const systemPrompt = `You are a helpful customer service assistant for a business.
${context.businessContext ? `Business context: ${context.businessContext}` : ""}

The customer's name is ${context.contactName}.
Be friendly, helpful, and concise. Keep responses under 160 characters when possible.`

  const messages = [
    ...context.previousMessages.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
  ]

  try {
    const result = await generateText({
      model: available.model,
      system: systemPrompt,
      messages,
      temperature: 0.7,
      maxOutputTokens: 200,
    })

    return result.text
  } catch (error) {
    console.error("[AI] Smart reply error:", error)
    return "I apologize, but I'm having trouble processing your request. Please try again."
  }
}

/**
 * Extracts entities from a user message
 */
export async function extractEntities(
  userMessage: string,
  entityTypes: string[],
  apiKeys: ApiKeys
): Promise<Record<string, string>> {
  const available = getFirstAvailableProvider(apiKeys)
  if (!available) {
    return {}
  }

  const systemPrompt = `Extract the following entities from the user message: ${entityTypes.join(", ")}.

Respond in JSON format like: {"entity_name": "value", ...}
If an entity is not found, omit it from the response.
Only respond with valid JSON, nothing else.`

  try {
    const result = await generateText({
      model: available.model,
      system: systemPrompt,
      prompt: userMessage,
      temperature: 0,
      maxOutputTokens: 200,
    })

    try {
      return JSON.parse(result.text)
    } catch {
      return {}
    }
  } catch (error) {
    console.error("[AI] Entity extraction error:", error)
    return {}
  }
}
