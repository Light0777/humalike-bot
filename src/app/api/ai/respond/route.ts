import { NextRequest, NextResponse } from "next/server"
import { ConversationEngine } from "@/lib/conversation/engine"
import { getHumalikeDecision } from "@/lib/ai/humalike"
import { generateResponse } from "@/lib/ai/openrouter"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { room_id, ai_participant_id, ai_name } = body

    if (!room_id || !ai_participant_id) {
      return NextResponse.json(
        {
          error: "room_id and ai_participant_id are required",
        },
        { status: 400 }
      )
    }

    // Load conversation context
    const engine = new ConversationEngine(room_id)
    const messages = await engine.loadHistory()
    const transcript = engine.getTranscript()
    const activeSpeakers = engine.getActiveSpeakers()

    if (messages.length === 0) {
      return NextResponse.json({
        should_respond: false,
        reason: "No conversation history yet",
      })
    }

    // Load familiarity data
    const supabase = await createClient()
    const { data: relationships } = await supabase
      .from("relationships")
      .select("target_id, familiarity")
      .eq("participant_id", ai_participant_id)

    const familiarity: Record<string, number> = {}
    for (const rel of relationships || []) {
      const { data: target } = await supabase
        .from("participants")
        .select("username")
        .eq("id", rel.target_id)
        .single()
      if (target) {
        familiarity[target.username] = rel.familiarity
      }
    }

    // Humalike decides behavior
    const decision = await getHumalikeDecision({
      transcript,
      activeSpeakers,
      speakerCount: messages.length,
      familiarity,
      recentTopics: [],
    })

    if (!decision.shouldSpeak) {
      return NextResponse.json({
        should_respond: false,
        reason: decision.reasoning || "Humalike decided to stay silent",
      })
    }

    // Load memories
    const { data: memories } = await supabase
      .from("memories")
      .select("content")
      .eq("participant_id", ai_participant_id)
      .order("created_at", { ascending: false })
      .limit(5)

    // Generate response
    const responseText = await generateResponse({
      transcript,
      aiName: ai_name || "AI",
      tone: decision.tone,
      emotion: decision.emotion,
      targetUser: decision.targetUser,
      memories: (memories || []).map((m: { content: string }) => m.content),
      familiarity,
    })

    // Save the AI message
    await engine.addMessage(
      ai_participant_id,
      ai_name || "AI",
      responseText
    )

    return NextResponse.json({
      should_respond: true,
      text: responseText,
      tone: decision.tone,
      emotion: decision.emotion,
      targetUser: decision.targetUser,
    })
  } catch (error) {
    console.error("AI respond pipeline failed:", error)
    return NextResponse.json(
      { error: "AI response failed" },
      { status: 500 }
    )
  }
}
