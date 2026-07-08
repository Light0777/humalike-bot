import { NextRequest, NextResponse } from "next/server"
import { createRoom } from "@/lib/supabase/service"
import { generateRoomCode } from "@/lib/utils"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Room name is required" },
        { status: 400 }
      )
    }

    const code = generateRoomCode()
    const room = await createRoom(code, name.trim())

    return NextResponse.json(room, { status: 201 })
  } catch (error) {
    console.error("Failed to create room:", error)
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 }
    )
  }
}
