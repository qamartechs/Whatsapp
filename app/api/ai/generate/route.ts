import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"

// Available AI models for each provider
export const AI_MODELS = {
  openai: [
    { id: "openai/gpt-4o", name: "GPT-4o", description: "Most capable OpenAI model" },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and efficient" },
    { id: "openai/gpt-5-mini", name: "GPT-5 Mini", description: "Latest GPT-5 mini model" },
  ],
  anthropic: [
    { id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6", description: "Most capable Claude model" },
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", description: "Balanced performance" },
  ],
  google: [
    { id: "google/gemini-3-flash", name: "Gemini 3 Flash", description: "Fast Google model" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Advanced reasoning" },
  ],
  groq: [
    { id: "groq/llama-3.3-70b-versatile", name: "Llama 3.3 70B", description: "Fast Llama model via Groq" },
    { id: "groq/llama-3.1-8b-instant", name: "Llama 3.1 8B", description: "Ultra-fast inference" },
  ],
  deepseek: [
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", description: "DeepSeek conversational model" },
    { id: "deepseek/deepseek-reasoner", name: "DeepSeek Reasoner", description: "Advanced reasoning" },
  ],
}

// POST /api/ai/generate - Generate AI response
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      prompt,
      systemPrompt,
      model = "openai/gpt-4o",
      maxTokens = 500,
      temperature = 0.7,
      conversationHistory = [],
    } = body

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      )
    }

    // Build messages array
    const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = []

    // Add conversation history if provided
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })
    }

    // Add the current prompt
    messages.push({
      role: "user",
      content: prompt,
    })

    const result = await generateText({
      model,
      system: systemPrompt || "You are a helpful assistant for a WhatsApp chatbot. Be concise and friendly.",
      messages,
      maxOutputTokens: maxTokens,
      temperature,
    })

    return NextResponse.json({
      text: result.text,
      usage: result.usage,
      finishReason: result.finishReason,
    })
  } catch (error) {
    console.error("[AI Generate Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate AI response" },
      { status: 500 }
    )
  }
}

// GET /api/ai/generate - Get available models
export async function GET() {
  return NextResponse.json({ models: AI_MODELS })
}
