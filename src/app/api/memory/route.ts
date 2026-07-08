import { NextRequest, NextResponse } from "next/server"
import { MemoryService } from "@/lib/memory/service"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, participant_id, ...params } = body

    if (!participant_id) {
      return NextResponse.json(
        { error: "participant_id is required" },
        { status: 400 }
      )
    }

    const memory = new MemoryService(participant_id)

    switch (action) {
      case "add_memory": {
        const { content, type, importance } = params
        if (!content) {
          return NextResponse.json(
            { error: "content is required" },
            { status: 400 }
          )
        }
        await memory.addMemory(content, type || "fact", importance || 0.5)
        return NextResponse.json({ success: true })
      }

      case "update_relationship": {
        const { target_id, familiarity, trust, opinion } = params
        if (!target_id) {
          return NextResponse.json(
            { error: "target_id is required" },
            { status: 400 }
          )
        }
        await memory.updateRelationship(target_id, {
          familiarity,
          trust,
          opinion,
        })
        return NextResponse.json({ success: true })
      }

      case "recall": {
        const memories = await memory.recallMemories(params.limit || 10)
        return NextResponse.json({ memories })
      }

      case "relationships": {
        const rels = await memory.getAllRelationships()
        return NextResponse.json({ relationships: rels })
      }

      case "user_spoke": {
        const { speaker_id, content } = params
        if (!speaker_id || !content) {
          return NextResponse.json(
            { error: "speaker_id and content are required" },
            { status: 400 }
          )
        }
        await memory.onUserSpoke(speaker_id, content)

        // Return updated familiarity for this speaker
        const rel = await memory.getFamiliarity(speaker_id)
        return NextResponse.json({
          success: true,
          familiarity: rel.familiarity,
          trust: rel.trust,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error("Memory operation failed:", error)
    return NextResponse.json(
      { error: "Memory operation failed" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const participant_id = searchParams.get("participant_id")
    const type = searchParams.get("type") || "all"

    if (!participant_id) {
      return NextResponse.json(
        { error: "participant_id is required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    if (type === "relationships") {
      const { data: rels } = await supabase
        .from("relationships")
        .select("*, participants!target_id(username)")
        .eq("participant_id", participant_id)
      return NextResponse.json({ relationships: rels || [] })
    }

    if (type === "memories") {
      const { data: mems } = await supabase
        .from("memories")
        .select("*")
        .eq("participant_id", participant_id)
        .order("created_at", { ascending: false })
        .limit(50)
      return NextResponse.json({ memories: mems || [] })
    }

    const memory = new MemoryService(participant_id)
    const [memories, rels] = await Promise.all([
      memory.recallMemories(10),
      memory.getAllRelationships(),
    ])

    return NextResponse.json({ memories, relationships: rels })
  } catch (error) {
    console.error("Failed to load memory:", error)
    return NextResponse.json(
      { error: "Failed to load memory" },
      { status: 500 }
    )
  }
}
