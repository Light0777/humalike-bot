import { NextRequest, NextResponse } from "next/server"
import { addAIToRoom, removeAIFromRoom } from "@/lib/ai/ai-service"
import { openThread } from "@/lib/ai/humalike-turn-taking"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { room_id, action } = body

    if (!room_id || !action) {
      return NextResponse.json(
        { error: "room_id and action (add/remove) are required" },
        { status: 400 }
      )
    }

    if (action === "add") {
      const ai = await addAIToRoom(room_id)
      await openThread(room_id).catch((e) =>
        console.error("Failed to open Humalike thread:", e)
      )
      return NextResponse.json(ai)
    }

    if (action === "remove") {
      await removeAIFromRoom(room_id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("AI action failed:", error)
    return NextResponse.json(
      { error: "AI action failed" },
      { status: 500 }
    )
  }
}
