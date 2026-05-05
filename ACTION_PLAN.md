# WhatsApp Bot - Action Plan & Quick Fixes

## QUICK WINS (Can be fixed in 30 minutes each)

### Fix 1: Add `.single()` Error Handling Pattern
Create a helper function to standardize error handling:

```ts
// lib/supabase/helpers.ts
export async function getSingleOrThrow<T>(
  query: PromiseLike<{ data: T | null; error: any }>,
  context: string
): Promise<T> {
  const { data, error } = await query
  
  if (error) {
    console.error(`[v0] ${context}: Database error`, error)
    throw new Error(`${context}: ${error.message}`)
  }
  
  if (!data) {
    throw new Error(`${context}: No data found`)
  }
  
  return data
}

// Usage in executor.ts:
const contact = await getSingleOrThrow(
  supabase.from("contacts").select("*").single(),
  "Get contact in webhook"
)
```

---

### Fix 2: Add Request Validation with Zod
```ts
// lib/validation.ts
import { z } from "zod"

export const SendMessageSchema = z.object({
  contactId: z.string().uuid(),
  message: z.object({
    type: z.enum(["text", "image", "video"]),
    text: z.string().optional(),
    mediaUrl: z.string().url().optional(),
  }),
  replyToMessageId: z.string().uuid().optional(),
})

// Usage in API route:
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contactId, message, replyToMessageId } = SendMessageSchema.parse(body)
    // Safe to use now
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      )
    }
    throw error
  }
}
```

---

### Fix 3: Fix Race Condition with Upsert
```ts
// ❌ BEFORE - Race condition
let { data: contact } = await supabase
  .from("contacts")
  .select("*")
  .eq("user_id", userId)
  .eq("phone", senderPhone)
  .single()

if (!contact) {
  const { data: newContact } = await supabase
    .from("contacts")
    .insert({...})
    .single()
  contact = newContact
}

// ✅ AFTER - Atomic operation
const { data: contact, error } = await supabase
  .from("contacts")
  .upsert({
    user_id: userId,
    phone: senderPhone,
    name: contactName || null,
  }, {
    onConflict: "user_id,phone",
  })
  .select()
  .single()

if (error) {
  console.error("[v0] Upsert contact failed:", error)
  return
}
```

---

### Fix 4: Validate Environment Variables on Startup
```ts
// lib/env.ts
function validateEnv() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]

  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}\n` +
      `See .env.example for required variables`
    )
  }
}

// Call in app/layout.tsx or middleware
if (typeof window === "undefined") {
  validateEnv()
}
```

---

## MEDIUM FIXES (30-60 minutes each)

### Fix 5: Implement Transactional Operations
```ts
// lib/supabase/transactions.ts
export async function handleIncomingMessageTransaction(
  supabase: SupabaseClient,
  userId: string,
  contactData: any,
  messageData: any
) {
  // Use RPC function for transaction
  const { data, error } = await supabase.rpc("handle_incoming_message", {
    user_id: userId,
    contact_data: contactData,
    message_data: messageData,
  })

  if (error) throw error
  return data
}
```

---

### Fix 6: Add Type Guards for Discriminated Unions
```ts
// lib/types-guards.ts
export function isMessageNode(node: FlowNode): node is FlowNode<MessageNodeData> {
  return node.type === "message"
}

export function isConditionNode(node: FlowNode): node is FlowNode<ConditionNodeData> {
  return node.type === "condition"
}

// Usage:
if (isMessageNode(node)) {
  // TypeScript knows node.data is MessageNodeData
  const text = node.data.text
}
```

---

### Fix 7: Add Structured Logging
```ts
// lib/logger.ts
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export function log(level: LogLevel, context: string, message: string, data?: any) {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level: LogLevel[level],
    context,
    message,
    ...(data && { data }),
  }
  
  console.log(JSON.stringify(logEntry))
}

// Usage:
log(LogLevel.INFO, "Webhook", "Processing message", { messageId, contactId })
```

---

### Fix 8: Add Rate Limiting
```ts
// lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "1 h"),
  analytics: true,
})

export async function checkRateLimit(userId: string) {
  const { success } = await ratelimit.limit(userId)
  return success
}

// Usage in webhook:
if (!(await checkRateLimit(userId))) {
  return NextResponse.json(
    { error: "Rate limit exceeded" },
    { status: 429 }
  )
}
```

---

## COMPLEX FIXES (1-2 hours each)

### Fix 9: Refactor AI Key Storage
```ts
// Move from profiles table to encrypted Supabase vault

// Option A: Use Supabase Vault (built-in encryption)
// ALTER TABLE profiles ADD COLUMN ai_keys_encrypted TEXT;
// SELECT vault.create_secret('user_123_openai', '{...}');

// Option B: Use environment variables for multi-tenant
// OPENAI_API_KEY, ANTHROPIC_API_KEY stored as Vercel secrets

// Option C: External secret manager (Hashicorp Vault)
```

---

### Fix 10: Implement Message Queue
```ts
// Use Upstash Redis Queue for background jobs
// lib/queue.ts

import { Queue } from "upstash/queueing"

const queue = new Queue({
  baseUrl: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function scheduleMessage(
  message: WhatsAppMessage,
  delayMs: number
) {
  await queue.scheduleObject(
    { action: "send_message", payload: message },
    { delay: delayMs }
  )
}

// Handle in background:
export async function handleQueueMessage(msg: any) {
  if (msg.action === "send_message") {
    await sendWhatsAppMessage(msg.payload)
  }
}
```

---

### Fix 11: Add Input Validation for Variables
```ts
// lib/engine/validation.ts

export function validateVariableInterpolation(
  template: string,
  variables: Record<string, unknown>
): { success: boolean; error?: string } {
  const keys = template.match(/\{\{(\w+)\}\}/g) || []
  
  for (const key of keys) {
    const varName = key.slice(2, -2)
    const value = variables[varName]
    
    if (value === undefined) {
      return {
        success: false,
        error: `Variable ${varName} is not defined`,
      }
    }
    
    if (typeof value === "string" && value.length > 4096) {
      return {
        success: false,
        error: `Variable ${varName} exceeds max length (4096 chars)`,
      }
    }
  }
  
  return { success: true }
}
```

---

## CONSTANTS TO EXTRACT (Magic Numbers)

```ts
// lib/constants.ts
export const EXECUTION_CONFIG = {
  MAX_DEPTH: 50,
  TIMEOUT_MS: 30000,
  MAX_VARIABLE_SIZE: 4096,
  MAX_MESSAGE_SIZE: 4096,
}

export const MESSAGE_LIMITS = {
  TEXT_MAX: 4096,
  HEADER_MAX: 60,
  FOOTER_MAX: 60,
  BUTTON_TEXT_MAX: 20,
  SECTION_TITLE_MAX: 24,
  LIST_ROW_TITLE_MAX: 24,
  LIST_ROW_DESC_MAX: 72,
  CAROUSEL_MAX_CARDS: 10,
}

export const WHATSAPP_CONFIG = {
  API_VERSION: "v21.0",
  API_BASE: "https://graph.facebook.com",
}

export const LOG_PREFIXES = {
  WEBHOOK: "[Webhook]",
  EXECUTOR: "[Executor]",
  AI: "[AI]",
  WHATSAPP: "[WhatsApp]",
  DB: "[Database]",
} as const
```

---

## Testing Strategy

```ts
// tests/executor.test.ts
import { executeNode } from "@/lib/engine/executor"

describe("Message Node Execution", () => {
  it("should interpolate variables correctly", async () => {
    const context = {
      variables: { name: "John", count: 5 },
      // ...
    }
    
    const result = await executeNode(messageNode, context)
    expect(result.success).toBe(true)
  })

  it("should handle missing variables gracefully", async () => {
    const context = {
      variables: { /* missing required var */ },
      // ...
    }
    
    const result = await executeNode(messageNode, context)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Variable not defined")
  })
})

// tests/webhook.test.ts
describe("Webhook Processing", () => {
  it("should not create duplicate contacts on concurrent requests", async () => {
    // Simulate race condition
    const promises = [
      handleIncomingMessage(...),
      handleIncomingMessage(...),
    ]
    
    await Promise.all(promises)
    
    // Verify only one contact created
    const contacts = await supabase
      .from("contacts")
      .select()
      .eq("phone", "+123456789")
    
    expect(contacts.data).toHaveLength(1)
  })
})
```

---

## File-by-File Quick Fixes

### `lib/engine/executor.ts` (HIGHEST PRIORITY)
- [ ] Add error handling to all `.single()` calls (lines 1200, 1263, etc.)
- [ ] Extract magic numbers to constants
- [ ] Add input validation before variable interpolation
- [ ] Add JSDoc to executeNode and helper functions

### `app/api/webhook/whatsapp/route.ts`
- [ ] Replace contact creation with upsert
- [ ] Add request validation
- [ ] Wrap operations in transaction
- [ ] Add better error logging

### `lib/engine/ai.ts`
- [ ] Move API keys to environment variables
- [ ] Add validation before calling AI
- [ ] Add retry logic with exponential backoff

### `app/api/whatsapp/send/route.ts`
- [ ] Add request validation with Zod
- [ ] Add proper error handling
- [ ] Add rate limiting check

---

## Monitoring & Observability

Add to production:
- [ ] Sentry for error tracking
- [ ] LogRocket for session replay
- [ ] OpenTelemetry for tracing
- [ ] DataDog for metrics
- [ ] Status page for incidents
