import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateFlowPayload } from "@/lib/validation"

// GET /api/flows - List all flows for the authenticated user
export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: flows, error } = await supabase
      .from("flows")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("[Flows API Error]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ flows })
  } catch (error) {
    console.error("[Flows API Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// POST /api/flows - Create a new flow
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const validation = validateFlowPayload(body)

    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { name, description, nodes, edges, variables, trigger_keywords } = validation.data

    // Create default start node if nodes not provided
    const defaultNodes = nodes || [
      {
        id: "start-1",
        type: "start",
        position: { x: 250, y: 50 },
        data: { label: "Start", triggerType: "keyword", keywords: [] },
      },
    ]

    const { data: flows, error } = await supabase
      .from("flows")
      .insert({
        user_id: user.id,
        name,
        description: description || null,
        nodes: defaultNodes,
        edges: edges || [],
        variables: variables || {},
        trigger_keywords: trigger_keywords || [],
        is_active: false,
      })
      .select()

    if (error) {
      console.error("[Flows API Error]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!flows || flows.length === 0) {
      console.error("[Flows API Error] No flow returned from insert")
      return NextResponse.json({ error: "Failed to create flow" }, { status: 500 })
    }

    return NextResponse.json({ flow: flows[0] }, { status: 201 })
  } catch (error) {
    console.error("[Flows API Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
