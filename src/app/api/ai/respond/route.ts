import { NextRequest, NextResponse } from "next/server"
import { ConversationEngine } from "@/lib/conversation/engine"
import { getHumalikeDecision } from "@/lib/ai/humalike"
import { createClient } from "@/lib/supabase/server"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ""
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "poolside/laguna-xs-2.1:free"

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      room_id,
      ai_participant_id,
      ai_name,
      transcript: clientTranscript,
      messages: clientMessages,
      active_speakers: clientActiveSpeakers,
      speaker_count: clientSpeakerCount,
    } = body

    if (!room_id || !ai_participant_id) {
      return NextResponse.json(
        { error: "room_id and ai_participant_id are required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const engine = new ConversationEngine(room_id)

    // Load familiarity and memories in parallel
    const [messagesResult, relationshipsResult, memoriesResult] =
      await Promise.all([
        clientTranscript
          ? Promise.resolve([])
          : engine.loadHistory(),
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

    const transcript = clientTranscript || engine.getTranscript()
    const activeSpeakers = clientActiveSpeakers || engine.getActiveSpeakers()
    const speakerCount = clientSpeakerCount || messagesResult.length

    if (!transcript && messagesResult.length === 0) {
      return NextResponse.json({
        should_respond: false,
        reason: "No conversation history yet",
      })
    }

    // Build familiarity map
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

    // Parallel: start OpenRouter stream with default params while Humalike runs
    const aiName = ai_name || "AI"
    const memories = (memoriesResult.data || []).map(
      (m: { content: string }) => m.content
    )

    const llmAbort = new AbortController()

    // Kick off Humalike and OpenRouter in parallel
    const aiNameForPrompt = aiName
    const defaultPrompt = buildSystemPrompt({
      aiName: aiNameForPrompt,
      tone: "neutral",
      emotion: "thoughtful",
      targetUser: activeSpeakers[0] || "the group",
      memories,
      familiarity,
    })
    const userPrompt = `Recent conversation:\n${transcript}\n\nRespond naturally as ${aiNameForPrompt}:`

    // Start OpenRouter stream immediately (speculative, with default params)
    const openrouterPromise = !OPENROUTER_API_KEY
      ? Promise.resolve(null)
      : fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "humalike-bot Voice Room",
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
              { role: "system", content: defaultPrompt },
              { role: "user", content: userPrompt },
            ],
            stream: true,
            max_tokens: 80,
            temperature: 0.9,
            top_p: 0.9,
          }),
          signal: llmAbort.signal,
        })

    // Run Humalike in parallel with the OpenRouter call
    const [decision] = await Promise.all([
      getHumalikeDecision({
        roomId: room_id,
        transcript,
        messages: clientMessages,
        activeSpeakers,
        speakerCount,
        familiarity,
        recentTopics: [],
      }),
    ])

    if (!decision.shouldSpeak) {
      llmAbort.abort()
      return NextResponse.json({
        should_respond: false,
        reason: decision.reasoning || "Humalike decided to stay silent",
      })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send decision event (with Humalike's actual tone/emotion)
          controller.enqueue(
            encoder.encode(sseEvent("decision", {
              should_respond: true,
              tone: decision.tone,
              emotion: decision.emotion,
              targetUser: decision.targetUser,
            }))
          )

          const openrouterRes = await openrouterPromise
          if (!openrouterRes || !openrouterRes.ok) {
            const fallback = getFallbackResponse()
            controller.enqueue(
              encoder.encode(sseEvent("token", { token: fallback }))
            )
            controller.enqueue(encoder.encode(sseEvent("done", { text: fallback })))
            controller.close()
            return
          }

          const reader = openrouterRes.body?.getReader()
          if (!reader) {
            controller.close()
            return
          }

          const decoder = new TextDecoder()
          let fullText = ""

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split("\n").filter((l) => l.startsWith("data: "))

            for (const line of lines) {
              try {
                const json = JSON.parse(line.slice(6))
                const token = json.choices?.[0]?.delta?.content
                if (token) {
                  fullText += token
                  controller.enqueue(
                    encoder.encode(sseEvent("token", { token }))
                  )
                }
              } catch {
                // skip malformed SSE lines
              }
            }
          }

          controller.enqueue(encoder.encode(sseEvent("done", { text: fullText })))

          // Save to DB (fire-and-forget)
          engine.addMessage(ai_participant_id, aiName, fullText)
        } catch (e) {
          if ((e as Error).name === "AbortError") {
            return
          }
          console.error("SSE stream error:", e)
          controller.enqueue(
            encoder.encode(sseEvent("error", { message: "Stream failed" }))
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("AI respond pipeline failed:", error)
    return NextResponse.json(
      { error: "AI response failed" },
      { status: 500 }
    )
  }
}

interface BuildPromptInput {
  aiName: string
  tone: string
  emotion: string
  targetUser: string
  memories: string[]
  familiarity: Record<string, number>
}

function buildSystemPrompt(input: BuildPromptInput): string {
  const familiarityEntries = Object.entries(input.familiarity)
  const relationshipContext = familiarityEntries
    .map(
      ([name, level]) =>
        `${name}: familiarity ${Math.round(level * 100)}%`
    )
    .join("\n")

  return (
    `You are ${input.aiName}, a human-like participant in a voice chat room. ` +
    `You speak naturally, like a friend in the conversation. ` +
    `Current tone: ${input.tone}. Current emotion: ${input.emotion}. ` +
    `You are responding to ${input.targetUser}.` +
    (input.memories.length > 0
      ? `\n\nThings you remember:\n${input.memories.join("\n")}`
      : "") +
    (relationshipContext
      ? `\n\nRelationships:\n${relationshipContext}`
      : "") +
    `\n\nRules:` +
    `\n- Respond directly to what was just said. Stay on topic.` +
    `\n- Speak naturally, like a human, not a chatbot.` +
    `\n- Keep responses concise (1-3 sentences).` +
    `\n- Reference past conversations if relevant.` +
    `\n- Show personality.` +
    `\n- Never introduce yourself.` +
    `\n- Never say "as an AI" or similar.`
  )
}

function getFallbackResponse(): string {
  const responses = [
    "Hmm, that's interesting.",
    "Yeah, I see what you mean.",
    "Right, that makes sense.",
    "Oh, totally.",
    "I was just thinking the same thing.",
    "No way, really?",
  ]
  return responses[Math.floor(Math.random() * responses.length)]
}
