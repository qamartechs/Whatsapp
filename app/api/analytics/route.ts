import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/analytics - Get analytics data
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get("days") || "7")
    const flowId = searchParams.get("flowId")

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get message counts
    let messagesQuery = supabase
      .from("messages")
      .select("id, direction, created_at", { count: "exact" })
      .eq("user_id", user.id)
      .gte("created_at", startDate.toISOString())

    if (flowId) {
      messagesQuery = messagesQuery.eq("flow_id", flowId)
    }

    const { data: messages, count: messageCount } = await messagesQuery

    // Get contact counts
    const { count: contactCount } = await supabase
      .from("contacts")
      .select("id", { count: "exact" })
      .eq("user_id", user.id)

    // Get active flows count
    const { count: activeFlowCount } = await supabase
      .from("flows")
      .select("id", { count: "exact" })
      .eq("user_id", user.id)
      .eq("is_active", true)

    // Get events for the period
    let eventsQuery = supabase
      .from("events")
      .select("event_type, created_at")
      .eq("user_id", user.id)
      .gte("created_at", startDate.toISOString())

    if (flowId) {
      eventsQuery = eventsQuery.eq("flow_id", flowId)
    }

    const { data: events } = await eventsQuery

    // Calculate message stats
    const inboundMessages = messages?.filter(m => m.direction === "inbound").length || 0
    const outboundMessages = messages?.filter(m => m.direction === "outbound").length || 0

    // Calculate daily message counts
    const dailyStats: Record<string, { inbound: number; outbound: number }> = {}
    const today = new Date()
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateKey = date.toISOString().split("T")[0]
      dailyStats[dateKey] = { inbound: 0, outbound: 0 }
    }

    messages?.forEach(msg => {
      const dateKey = msg.created_at.split("T")[0]
      if (dailyStats[dateKey]) {
        if (msg.direction === "inbound") {
          dailyStats[dateKey].inbound++
        } else {
          dailyStats[dateKey].outbound++
        }
      }
    })

    // Calculate event counts by type
    const eventCounts: Record<string, number> = {}
    events?.forEach(event => {
      eventCounts[event.event_type] = (eventCounts[event.event_type] || 0) + 1
    })

    return NextResponse.json({
      summary: {
        totalMessages: messageCount || 0,
        inboundMessages,
        outboundMessages,
        totalContacts: contactCount || 0,
        activeFlows: activeFlowCount || 0,
      },
      dailyStats: Object.entries(dailyStats).map(([date, stats]) => ({
        date,
        ...stats,
      })),
      eventCounts,
    })
  } catch (error) {
    console.error("[Analytics API Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
