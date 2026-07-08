import { NextRequest, NextResponse } from "next/server"
import { ConversationEngine } from "@/lib/conversation/engine"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { room_id, participant_id, participant_username, content } = body

    if (!room_id || !participant_id || !content) {
      return NextResponse.json(
        {
          error:
            "room_id, participant_id, and content are required",
        },
        { status: 400 }
      )
    }

    const engine = new ConversationEngine(room_id)
    const message = await engine.addMessage(
      participant_id,
      participant_username || "Unknown",
      content
    )

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error("Failed to save conversation:", error)
    return NextResponse.json(
      { error: "Failed to save conversation" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const room_id = searchParams.get("room_id")

    if (!room_id) {
      return NextResponse.json(
        { error: "room_id query parameter is required" },
        { status: 400 }
      )
    }

    const engine = new ConversationEngine(room_id)
    const messages = await engine.loadHistory()

    return NextResponse.json({
      messages,
      transcript: engine.getTranscript(),
      active_speakers: engine.getActiveSpeakers(),
    })
  } catch (error) {
    console.error("Failed to load conversations:", error)
    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500 }
    )
  }
}
