/**
 * Humalike API client.
 *
 * Humalike decides conversational behavior:
 * - whether to speak or stay silent
 * - who to respond to
 * - emotional tone
 * - social dynamics
 */

const HUMALIKE_API_URL =
  process.env.HUMALIKE_API_URL || "http://localhost:8080"
const HUMALIKE_API_KEY = process.env.HUMALIKE_API_KEY || ""

export interface HumalikeDecision {
  shouldSpeak: boolean
  targetUser: string
  tone: "neutral" | "warm" | "playful" | "serious" | "sarcastic" | "supportive"
  emotion: "neutral" | "happy" | "curious" | "amused" | "thoughtful" | "surprised"
  confidence: number
  reasoning: string
}

interface HumalikeRequest {
  transcript: string
  activeSpeakers: string[]
  speakerCount: number
  lastAiMessage?: string
  familiarity: Record<string, number>
  recentTopics: string[]
}

export async function getHumalikeDecision(
  input: HumalikeRequest
): Promise<HumalikeDecision> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (HUMALIKE_API_KEY) {
    headers["Authorization"] = `Bearer ${HUMALIKE_API_KEY}`
  }

  try {
    const response = await fetch(`${HUMALIKE_API_URL}/decide`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      console.warn(
        `Humalike API returned ${response.status}, falling back to default decision`
      )
      return getDefaultDecision(input)
    }

    const decision = await response.json()
    return {
      shouldSpeak: decision.should_speak ?? false,
      targetUser: decision.target_user ?? input.activeSpeakers[0] ?? "",
      tone: decision.tone ?? "neutral",
      emotion: decision.emotion ?? "neutral",
      confidence: decision.confidence ?? 0.5,
      reasoning: decision.reasoning ?? "",
    }
  } catch {
    console.warn("Humalike API unavailable, using default decision")
    return getDefaultDecision(input)
  }
}

function getDefaultDecision(
  input: HumalikeRequest
): HumalikeDecision {
  const lines = input.transcript.split("\n").filter(Boolean)
  const lastLine = lines.at(-1) ?? ""
  const lastContent = lastLine.replace(/^[^:]+:\s*/, "")

  const isQuestion =
    /\?\s*$/.test(lastContent) ||
    /^(can|could|will|would|do|does|is|are|what|why|how|tell|give)\b/i.test(lastContent)

  let shouldSpeak: boolean
  if (input.speakerCount === 0) {
    shouldSpeak = false
  } else if (isQuestion) {
    shouldSpeak = true
  } else if (input.speakerCount >= 3) {
    shouldSpeak = Math.random() < 0.4
  } else {
    shouldSpeak = Math.random() < 0.3
  }

  return {
    shouldSpeak,
    targetUser: input.activeSpeakers[0] || "",
    tone: "neutral",
    emotion: "thoughtful",
    confidence: 0.4,
    reasoning: "default decision (Humalike API unavailable)",
  }
}
