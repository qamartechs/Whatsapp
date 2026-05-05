import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/flows/[id] - Get a single flow
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: flows, error } = await supabase
      .from("flows")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("[Flow API Error]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!flows || flows.length === 0) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 })
    }

    return NextResponse.json({ flow: flows[0] })
  } catch (error) {
    console.error("[Flow API Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// PATCH /api/flows/[id] - Update a flow
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, nodes, edges, variables, trigger_keywords, is_active } = body

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (nodes !== undefined) updateData.nodes = nodes
    if (edges !== undefined) updateData.edges = edges
    if (variables !== undefined) updateData.variables = variables
    if (trigger_keywords !== undefined) updateData.trigger_keywords = trigger_keywords
    if (is_active !== undefined) updateData.is_active = is_active

    const { data: flows, error } = await supabase
      .from("flows")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()

    if (error) {
      console.error("[Flow API Error]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!flows || flows.length === 0) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 })
    }

    return NextResponse.json({ flow: flows[0] })
  } catch (error) {
    console.error("[Flow API Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// DELETE /api/flows/[id] - Delete a flow
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("flows")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("[Flow API Error]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Flow API Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
