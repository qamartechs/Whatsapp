# WhatsApp Bot - Critical Fixes with Code Examples

## FIX #1: Add Error Handling to `.single()` Calls ⭐ HIGHEST PRIORITY

### The Problem
51+ calls to `.single()` without error handling cause silent failures:

```ts
// ❌ CURRENT CODE (line 1200 in executor.ts)
const { data: contact } = await supabase
  .from("contacts")
  .select("*")
  .eq("user_id", userId)
  .eq("phone", senderPhone)
  .single()

// If no rows: query object will have error, but code continues
// If multiple rows: query object will have error, but code continues
// Result: contact will be undefined → runtime error later
```

### The Solution

**Step 1: Create a helper function**
```ts
// lib/supabase/helpers.ts
import { SupabaseClient } from "@supabase/supabase-js"

interface SingleQueryResult<T> {
  data: T | null
  error?: {
    code?: string
    message: string
  }
}

export async function getSingle<T>(
  query: Promise<SingleQueryResult<T>>,
  context: string
): Promise<T | null> {
  try {
    const result = await query
    
    if (result.error) {
      const errorCode = result.error?.code
      const errorMsg = result.error?.message || "Unknown error"
      
      // Log the specific error
      if (errorCode === "PGRST116") {
        console.warn(`[v0] ${context}: No rows returned`)
      } else if (errorCode === "PGRST118") {
        console.error(`[v0] ${context}: Multiple rows returned (data integrity issue)`)
      } else {
        console.error(`[v0] ${context}: Database error:`, errorMsg)
      }
      
      return null
    }
    
    return result.data
  } catch (err) {
    console.error(`[v0] ${context}: Unexpected error:`, err)
    return null
  }
}

export async function getSingleOrThrow<T>(
  query: Promise<SingleQueryResult<T>>,
  context: string
): Promise<T> {
  const result = await getSingle(query, context)
  if (!result) {
    throw new Error(`${context}: Data not found`)
  }
  return result
}
```

**Step 2: Update imports in executor.ts**
```ts
import { getSingle, getSingleOrThrow } from "@/lib/supabase/helpers"
```

**Step 3: Replace all `.single()` calls in executor.ts**

Before (line 1200):
```ts
const { data: profile } = await getSupabaseAdmin()
  .from("profiles")
  .select("*")
  .eq("id", userId)
  .single()
```

After:
```ts
const profile = await getSingleOrThrow(
  getSupabaseAdmin()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single(),
  "Get user profile in flow execution"
)
```

**Files affected (use same pattern):**
- `lib/engine/executor.ts` - Lines: 1200, 1263, 1590, 1599, 1857, 2386, 2395, 2494
- `app/dashboard/settings/page.tsx` - Line: 60
- `app/dashboard/flows/page.tsx` - Line: 140
- `app/dashboard/flows/[id]/page.tsx` - Line: 43
- All API routes with `.single()`

---

## FIX #2: Fix Race Condition in Contact Creation ⭐ CRITICAL

### The Problem
In `app/api/webhook/whatsapp/route.ts` around line 83:

```ts
// ❌ CURRENT CODE - RACE CONDITION
let { data: contact } = await getSupabaseAdmin()
  .from("contacts")
  .select("*")
  .eq("user_id", userId)
  .eq("phone", senderPhone)
  .single()

if (!contact) {
  // TWO CONCURRENT WEBHOOKS CAN BOTH REACH HERE
  const { data: newContact, error } = await getSupabaseAdmin()
    .from("contacts")
    .insert({
      user_id: userId,
      phone: senderPhone,
      name: contactName || null,
    })
    .select()
    .single()
  
  if (error) {
    console.error("[Webhook] Error creating contact:", error)
    return
  }
  contact = newContact
}
```

### The Solution
Replace with atomic `upsert`:

```ts
// ✅ FIXED CODE
const { data: contact, error } = await getSupabaseAdmin()
  .from("contacts")
  .upsert(
    {
      user_id: userId,
      phone: senderPhone,
      name: contactName || null,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,phone", // Unique constraint
      ignoreDuplicates: false, // Update if exists
    }
  )
  .select()
  .single()

if (error) {
  console.error("[Webhook] Error upserting contact:", error)
  return
}

// contact is guaranteed to exist now
console.log("[Webhook] Contact ready:", { id: contact.id, phone: contact.phone })
```

**Database requirement:** Ensure unique constraint exists:
```sql
-- Run this migration
ALTER TABLE contacts 
ADD CONSTRAINT contacts_user_phone_unique 
UNIQUE(user_id, phone);
```

---

## FIX #3: Add Request Validation with Zod ⭐ CRITICAL

### The Problem
No validation on POST bodies - type errors at runtime:

```ts
// ❌ CURRENT CODE (app/api/whatsapp/send/route.ts)
export async function POST(request: NextRequest) {
  const body = await request.json() // Could be anything!
  const { contactId, message, replyToMessageId } = body
  
  if (!contactId || !message) {
    return NextResponse.json(
      { error: "Missing contactId or message" },
      { status: 400 }
    )
  }
  // Type of contactId and message still unknown
}
```

### The Solution

**Step 1: Create validation schemas**
```ts
// lib/validation.ts
import { z } from "zod"

export const SendMessageRequestSchema = z.object({
  contactId: z.string().uuid("Invalid contact ID"),
  message: z.object({
    type: z.enum(["text", "image", "video", "audio", "document"]),
    text: z.string().optional(),
    mediaUrl: z.string().url().optional(),
    caption: z.string().optional(),
  }),
  replyToMessageId: z.string().uuid().optional(),
}).strict() // Reject unknown properties

export const CreateFlowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  nodes: z.array(z.unknown()).optional(),
  edges: z.array(z.unknown()).optional(),
  variables: z.record(z.unknown()).optional(),
  trigger_keywords: z.array(z.string()).optional(),
}).strict()
```

**Step 2: Update API route**
```ts
// app/api/whatsapp/send/route.ts
import { SendMessageRequestSchema } from "@/lib/validation"
import { z } from "zod"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // VALIDATE REQUEST
    const body = await request.json()
    let validated: z.infer<typeof SendMessageRequestSchema>
    
    try {
      validated = SendMessageRequestSchema.parse(body)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: "Invalid request",
            details: error.errors.map(e => ({
              field: e.path.join("."),
              message: e.message,
            })),
          },
          { status: 400 }
        )
      }
      throw error
    }

    // NOW validated is type-safe
    const { contactId, message, replyToMessageId } = validated

    // ... rest of implementation
  } catch (error) {
    console.error("[Send Message]:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
```

**Apply to all POST routes:**
- `app/api/flows/route.ts` → `CreateFlowSchema`
- `app/api/settings/route.ts` → `UpdateSettingsSchema`
- `app/api/contacts/route.ts` → `CreateContactSchema`
- All other POST/PATCH/PUT endpoints

---

## FIX #4: Validate Environment Variables on Startup ⭐ CRITICAL

### The Problem
Silent failures if env vars missing:

```ts
// ❌ CURRENT CODE (lib/supabase/proxy.ts)
export async function updateSession(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,      // Will be undefined!
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,  // Will be undefined!
    // ... passes undefined to createServerClient → crashes
  )
}
```

### The Solution

**Step 1: Create env validation**
```ts
// lib/env.ts
export function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `Set it in .env.local or your platform's secrets manager`
    )
  }
  return value
}

export function getOptionalEnv(key: string): string | undefined {
  return process.env[key]
}

export function validateAllEnvVars() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]
  
  const missing: string[] = []
  
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }
  
  if (missing.length > 0) {
    console.error(
      "\n❌ FATAL: Missing environment variables:\n" +
      missing.map(k => `  - ${k}`).join("\n") +
      "\n\nSee .env.example or https://docs.yourapp.com/setup\n"
    )
    process.exit(1)
  }
  
  console.log("✅ Environment variables validated")
}
```

**Step 2: Call during startup**
```ts
// lib/supabase/proxy.ts
import { getRequiredEnv, validateAllEnvVars } from "@/lib/env"

export async function updateSession(request: NextRequest) {
  const supabase = createServerClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    // ...
  )
  // ...
}
```

**Step 3: Call in layout.tsx**
```ts
// app/layout.tsx
import { validateAllEnvVars } from "@/lib/env"

// Validate on server-side initialization
if (typeof window === "undefined") {
  try {
    validateAllEnvVars()
  } catch (error) {
    console.error("[Layout] Environment validation failed:", error)
    process.exit(1)
  }
}

export default function RootLayout(...) {
  return (
    <html>
      {/* ... */}
    </html>
  )
}
```

---

## FIX #5: Add Transactional Support ⭐ HIGH PRIORITY

### The Problem
Contact creation, message save, and event logging are separate queries - if one fails, data is inconsistent:

```ts
// ❌ CURRENT CODE
await createContact()     // Success
await saveMessage()       // Success
await logEvent()          // FAILS - message saved but event lost
```

### The Solution

**Step 1: Create RPC function**
```sql
-- Run this SQL migration
CREATE OR REPLACE FUNCTION handle_incoming_message(
  p_user_id UUID,
  p_sender_phone TEXT,
  p_contact_name TEXT,
  p_message_type TEXT,
  p_message_content JSONB
) RETURNS JSONB AS $$
DECLARE
  v_contact_id UUID;
  v_message_id UUID;
BEGIN
  -- Upsert contact (atomic)
  INSERT INTO contacts (user_id, phone, name)
  VALUES (p_user_id, p_sender_phone, p_contact_name)
  ON CONFLICT(user_id, phone) DO UPDATE
  SET name = COALESCE(p_contact_name, contacts.name),
      updated_at = NOW()
  RETURNING id INTO v_contact_id;

  -- Save message
  INSERT INTO messages (user_id, contact_id, direction, message_type, content)
  VALUES (p_user_id, v_contact_id, 'inbound', p_message_type, p_message_content)
  RETURNING id INTO v_message_id;

  -- Log event
  INSERT INTO events (user_id, contact_id, event_type, payload)
  VALUES (p_user_id, v_contact_id, 'message_received', 
          jsonb_build_object('messageType', p_message_type));

  -- Return results
  RETURN jsonb_build_object(
    'contact_id', v_contact_id,
    'message_id', v_message_id,
    'success', true
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Call from webhook**
```ts
// app/api/webhook/whatsapp/route.ts
async function handleIncomingMessage(
  profile: Profile,
  message: WhatsAppIncomingMessage,
  contactName?: string
) {
  const db = getSupabaseAdmin()
  
  // Call RPC function - all-or-nothing
  const { data, error } = await db.rpc("handle_incoming_message", {
    p_user_id: profile.id,
    p_sender_phone: message.from,
    p_contact_name: contactName || null,
    p_message_type: message.type,
    p_message_content: extractMessageContent(message),
  })
  
  if (error) {
    console.error("[Webhook] Transaction failed:", error)
    return // All operations rolled back
  }
  
  console.log("[Webhook] Message processed:", {
    contactId: data.contact_id,
    messageId: data.message_id,
  })
  
  // Continue with flow execution using data.contact_id
}
```

---

## FIX #6: Validate Variable Interpolation ⭐ HIGH PRIORITY

### The Problem
No validation allows code injection in variable interpolation:

```ts
// ❌ CURRENT CODE (lib/engine/executor.ts)
function interpolate(template: string, variables: Record<string, unknown>): string {
  if (!template) return ""
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key]
    if (value === undefined || value === null) return ""
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)  // Could be huge string!
  })
}

// Usage:
const template = "Hello {{name}}, you have {{count}} messages"
const variables = {
  name: "John",
  count: 5,
  // But what if:
  // count: "x".repeat(10000)  // Exceeds limits
  // name: "<script>alert('xss')</script>" // Injection
}
```

### The Solution

```ts
// lib/engine/validation.ts
import { z } from "zod"

const VARIABLE_SIZE_LIMIT = 4096
const MESSAGE_SIZE_LIMIT = 4096

export function validateVariables(
  template: string,
  variables: Record<string, unknown>
): { valid: boolean; error?: string } {
  // Extract required variables from template
  const requiredVars = new Set(
    (template.match(/\{\{(\w+)\}\}/g) || [])
      .map(v => v.slice(2, -2))
  )
  
  for (const varName of requiredVars) {
    const value = variables[varName]
    
    // Check if variable exists
    if (value === undefined) {
      return {
        valid: false,
        error: `Variable "${varName}" is not defined`,
      }
    }
    
    // Check if null
    if (value === null) {
      return {
        valid: false,
        error: `Variable "${varName}" cannot be null`,
      }
    }
    
    // Validate size
    let valueStr: string
    if (typeof value === "object") {
      try {
        valueStr = JSON.stringify(value)
      } catch {
        return {
          valid: false,
          error: `Variable "${varName}" cannot be serialized`,
        }
      }
    } else {
      valueStr = String(value)
    }
    
    if (valueStr.length > VARIABLE_SIZE_LIMIT) {
      return {
        valid: false,
        error: `Variable "${varName}" exceeds max size (${VARIABLE_SIZE_LIMIT} chars)`,
      }
    }
  }
  
  return { valid: true }
}

export function interpolate(
  template: string,
  variables: Record<string, unknown>
): { success: boolean; result?: string; error?: string } {
  if (!template) return { success: true, result: "" }
  
  // Validate first
  const validation = validateVariables(template, variables)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    }
  }
  
  // Interpolate safely
  let result = template
  let resultSize = template.length
  
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key]!
    const valueStr = typeof value === "object" 
      ? JSON.stringify(value)
      : String(value)
    
    resultSize += valueStr.length - key.length - 4 // "{{key}}"
    
    if (resultSize > MESSAGE_SIZE_LIMIT) {
      throw new Error(`Interpolated message exceeds size limit (${MESSAGE_SIZE_LIMIT} chars)`)
    }
    
    return valueStr
  })
  
  return { success: true, result }
}
```

**Usage in executor:**
```ts
// lib/engine/executor.ts - Update message node execution
case "message": {
  const data = node.data as MessageNodeData
  const text = data.text || ""
  
  // VALIDATE before sending
  const interpolationResult = interpolate(text, ctx.variables)
  if (!interpolationResult.success) {
    return {
      success: false,
      error: `Failed to process message: ${interpolationResult.error}`,
    }
  }
  
  const finalText = interpolationResult.result!
  
  // Send only if valid
  const result = await sendWhatsAppMessage(
    ctx.profile.whatsapp_phone_id!,
    ctx.profile.whatsapp_token!,
    ctx.contact.phone,
    { type: "text", text: finalText }
  )
  break
}
```

---

## Implementation Timeline

| Fix | Effort | Priority | Week |
|-----|--------|----------|------|
| #1: `.single()` errors | 2 hrs | P0 | Week 1 |
| #2: Contact race condition | 30 min | P0 | Week 1 |
| #3: Request validation | 45 min | P0 | Week 1 |
| #4: Env vars | 30 min | P0 | Week 1 |
| #5: Transactions | 2 hrs | P0 | Week 1-2 |
| #6: Variable validation | 1 hr | P0 | Week 1-2 |

**Total Phase 1:** ~7 hours = 1 developer-week

---

## Testing Each Fix

```ts
// tests/critical-fixes.test.ts
import { getSingleOrThrow } from "@/lib/supabase/helpers"

describe("Fix #1: .single() error handling", () => {
  it("should throw when no rows returned", async () => {
    const query = supabase
      .from("contacts")
      .select("*")
      .eq("id", "nonexistent")
      .single()
    
    await expect(getSingleOrThrow(query, "test"))
      .rejects
      .toThrow()
  })
})

describe("Fix #2: Race condition prevention", () => {
  it("should not create duplicate contacts on concurrent upserts", async () => {
    const promises = Array(5).fill(null).map(() =>
      supabase.from("contacts").upsert({
        user_id: "user1",
        phone: "+123456789",
        name: "Test",
      }).select().single()
    )
    
    const results = await Promise.all(promises)
    const uniqueIds = new Set(results.map(r => r.data?.id))
    
    expect(uniqueIds.size).toBe(1) // Only one contact
  })
})
```

---

## Deployment Checklist

- [ ] All fixes code reviewed
- [ ] Tests passing (80%+ coverage)
- [ ] Staging environment tested
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] Monitoring/alerts configured
- [ ] Rollback plan documented
- [ ] Team trained on changes
- [ ] Gradual rollout (10% → 50% → 100%)
