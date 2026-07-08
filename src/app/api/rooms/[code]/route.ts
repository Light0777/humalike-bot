import { NextRequest, NextResponse } from "next/server"
import { getRoom } from "@/lib/supabase/service"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const room = await getRoom(code)

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    return NextResponse.json(room)
  } catch (error) {
    console.error("Failed to get room:", error)
    return NextResponse.json(
      { error: "Failed to get room" },
      { status: 500 }
    )
  }
}
