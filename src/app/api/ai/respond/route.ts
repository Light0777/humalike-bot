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

    // Load conversation context, familiarity, and memories in parallel
    const supabase = await createClient()
    const engine = new ConversationEngine(room_id)

    const [messagesResult, relationshipsResult, memoriesResult] =
      await Promise.all([
        engine.loadHistory(),
        supabase
          .from("relationships")
          .select("target_id, familiarity")
          .eq("participant_id", ai_participant_id),
        supabase
          .from("memories")
          .select("content")
          .eq("participant_id", ai_participant_id)
          .order("created_at", { ascending: false })
          .limit(5),
      ])

    const messages = messagesResult
    const transcript = engine.getTranscript()
    const activeSpeakers = engine.getActiveSpeakers()

    if (messages.length === 0) {
      return NextResponse.json({
        should_respond: false,
        reason: "No conversation history yet",
      })
    }

    // Build familiarity map — batch resolve usernames
    const relationshipTargetIds = (
      relationshipsResult.data || []
    ).map((r: { target_id: string }) => r.target_id)

    let familiarity: Record<string, number> = {}
    if (relationshipTargetIds.length > 0) {
      const { data: targets } = await supabase
        .from("participants")
        .select("id, username")
        .in("id", relationshipTargetIds)

      const usernameMap = new Map(
        (targets || []).map((t: { id: string; username: string }) => [
          t.id,
          t.username,
        ])
      )

      for (const rel of relationshipsResult.data || []) {
        const username = usernameMap.get(rel.target_id)
        if (username) {
          familiarity[username] = rel.familiarity
        }
      }
    }

    // Humalike decides behavior
    const decision = await getHumalikeDecision({
      roomId: room_id,
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

    // Generate response
    const { text: responseText, llmError } = await generateResponse({
      transcript,
      aiName: ai_name || "AI",
      tone: decision.tone,
      emotion: decision.emotion,
      targetUser: decision.targetUser,
      memories: (memoriesResult.data || []).map(
        (m: { content: string }) => m.content
      ),
      familiarity,
    })

    if (llmError) {
      console.error("AI respond LLM error:", llmError)
    }

    // Save the AI message (fire-and-forget to not block response)
    engine.addMessage(ai_participant_id, ai_name || "AI", responseText)

    return NextResponse.json({
      should_respond: true,
      text: responseText,
      tone: decision.tone,
      emotion: decision.emotion,
      targetUser: decision.targetUser,
      llmError: llmError || null,
    })
  } catch (error) {
    console.error("AI respond pipeline failed:", error)
    return NextResponse.json(
      { error: "AI response failed" },
      { status: 500 }
    )
  }
}
