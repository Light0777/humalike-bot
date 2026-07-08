import { NextRequest, NextResponse } from "next/server"
import {
  addParticipant,
  removeParticipant,
  getParticipants,
} from "@/lib/supabase/service"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { room_id, user_id, username, is_ai } = body

    if (!room_id || !user_id || !username) {
      return NextResponse.json(
        { error: "room_id, user_id, and username are required" },
        { status: 400 }
      )
    }

    const participant = await addParticipant(
      room_id,
      user_id,
      username,
      is_ai ?? false
    )
    return NextResponse.json(participant, { status: 201 })
  } catch (error) {
    console.error("Failed to add participant:", error)
    return NextResponse.json(
      { error: "Failed to add participant" },
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

    const participants = await getParticipants(room_id)
    return NextResponse.json(participants)
  } catch (error) {
    console.error("Failed to get participants:", error)
    return NextResponse.json(
      { error: "Failed to get participants" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "Participant id is required" },
        { status: 400 }
      )
    }

    await removeParticipant(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to remove participant:", error)
    return NextResponse.json(
      { error: "Failed to remove participant" },
      { status: 500 }
    )
  }
}
