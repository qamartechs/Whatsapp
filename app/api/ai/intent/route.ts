import { NextRequest, NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { z } from "zod"

// POST /api/ai/intent - Detect intent and extract entities from user message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      message,
      possibleIntents = [],
      model = "openai/gpt-4o-mini",
    } = body

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      )
    }

    const intentList = possibleIntents.length > 0
      ? possibleIntents.join(", ")
      : "greeting, question, complaint, request, feedback, other"

    const result = await generateText({
      model,
      system: `You are an intent detection system for a WhatsApp chatbot. 
Analyze the user message and extract:
1. The primary intent from this list: ${intentList}
2. The confidence level (0-1)
3. Any entities mentioned (names, dates, numbers, products, etc.)
4. The sentiment (positive, neutral, negative)

Be accurate and concise.`,
      prompt: `Analyze this message: "${message}"`,
      output: Output.object({
        schema: z.object({
          intent: z.string().describe("The detected intent"),
          confidence: z.number().min(0).max(1).describe("Confidence score"),
          entities: z.array(z.object({
            type: z.string().describe("Entity type (name, date, number, product, etc.)"),
            value: z.string().describe("The extracted value"),
          })).describe("Extracted entities"),
          sentiment: z.enum(["positive", "neutral", "negative"]).describe("Overall sentiment"),
          suggestedResponse: z.string().nullable().describe("Optional suggested response"),
        }),
      }),
    })

    return NextResponse.json(result.output)
  } catch (error) {
    console.error("[AI Intent Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to detect intent" },
      { status: 500 }
    )
  }
}
