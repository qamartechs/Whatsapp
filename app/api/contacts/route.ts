import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateContactPayload } from "@/lib/validation"

// GET /api/contacts - List all contacts
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    let query = supabase
      .from("contacts")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    const { data: contacts, count, error } = await query

    if (error) {
      console.error("[Contacts API Error]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ contacts, total: count })
  } catch (error) {
    console.error("[Contacts API Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// POST /api/contacts - Create a new contact
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const validation = validateContactPayload(body)

    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { phone, name, metadata, tags } = validation.data

    if (!phone) {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 })
    }

    // Check if contact already exists (prevents race conditions)
    const { data: existingContact, error: checkError } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", user.id)
      .eq("phone", phone)
      .single()

    if (!checkError && existingContact) {
      return NextResponse.json({ error: "Contact with this phone already exists" }, { status: 409 })
    }

    // If error is NOT "no rows found", it's a real error
    if (checkError && checkError.code !== "PGRST116") {
      console.error("[Contacts API Error]", checkError)
      return NextResponse.json({ error: checkError.message }, { status: 500 })
    }

    const { data: contacts, error } = await supabase
      .from("contacts")
      .insert({
        user_id: user.id,
        phone,
        name: name || null,
        metadata: metadata || {},
        tags: tags || [],
      })
      .select()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Contact with this phone already exists" }, { status: 409 })
      }
      console.error("[Contacts API Error]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!contacts || contacts.length === 0) {
      console.error("[Contacts API Error] No contact returned from insert")
      return NextResponse.json({ error: "Failed to create contact" }, { status: 500 })
    }

    return NextResponse.json({ contact: contacts[0] }, { status: 201 })
  } catch (error) {
    console.error("[Contacts API Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
