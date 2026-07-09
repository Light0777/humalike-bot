import { submitMessages } from "@/lib/ai/humalike-turn-taking"

export interface HumalikeDecision {
  shouldSpeak: boolean
  targetUser: string
  tone: "neutral" | "warm" | "playful" | "serious" | "sarcastic" | "supportive"
  emotion: "neutral" | "happy" | "curious" | "amused" | "thoughtful" | "surprised"
  confidence: number
  reasoning: string
}

interface HumalikeRequest {
  roomId: string
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
  // Extract the latest user messages from the transcript
  const lines = input.transcript.split("\n").filter(Boolean)
  const latestMessages = lines.slice(-5).map((line) => {
    const colon = line.indexOf(":")
    if (colon === -1) return { sender: "user", content: line }
    return {
      sender: line.slice(0, colon).trim(),
      content: line.slice(colon + 1).trim(),
    }
  })

  // Filter out AI's own messages — only submit human speech
  const humanMessages = latestMessages.filter(
    (m) => m.sender !== "AI"
  )

  if (humanMessages.length === 0) {
    return getDefaultDecision(input)
  }

  try {
    const result = await submitMessages(input.roomId, humanMessages)

    if (!result) {
      console.log("Humalike submitMessages returned null, using default decision")
      return getDefaultDecision(input)
    }

    console.log(
      `Humalike decision: ${result.decision} (turn_epoch=${result.turnEpoch})`
    )

    if (result.decision === "stay_silent") {
      const lastContent = humanMessages.at(-1)?.content?.toLowerCase() ?? ""
      const isGreeting = /^(hi|hello|hey|yo|sup|howdy|h(?:i|ey|ello)\b)/i.test(lastContent)
      if (isGreeting) {
        console.log("Humalike stay_silent overridden: greeting detected")
        return {
          shouldSpeak: true,
          targetUser: input.activeSpeakers[0] || "",
          tone: "warm",
          emotion: "happy",
          confidence: 0.9,
          reasoning: `Greeting override (turn_epoch=${result.turnEpoch})`,
        }
      }
      return {
        shouldSpeak: false,
        targetUser: input.activeSpeakers[0] || "",
        tone: "neutral",
        emotion: "thoughtful",
        confidence: 0.5,
        reasoning: `Humalike: stay_silent (turn_epoch=${result.turnEpoch})`,
      }
    }

    console.log("Humalike decided to speak")
    return {
      shouldSpeak: true,
      targetUser: input.activeSpeakers[0] || "",
      tone: "neutral",
      emotion: "curious",
      confidence: 0.7,
      reasoning: `Humalike: speak (turn_epoch=${result.turnEpoch})`,
    }
  } catch (e) {
    console.error("Humalike decision error:", e)
    return getDefaultDecision(input)
  }
}

function getDefaultDecision(
  input: HumalikeRequest
): HumalikeDecision {
  const lines = input.transcript.split("\n").filter(Boolean)
  const lastLine = lines.at(-1) ?? ""
  const lastContent = lastLine.replace(/^[^:]+:\s*/, "").trim().toLowerCase()

  const isQuestion =
    /\?\s*$/.test(lastContent) ||
    /^(can|could|will|would|do|does|is|are|what|why|how|tell|give)\b/i.test(lastContent)

  const isGreeting = /^(hi|hello|hey|yo|sup|howdy|h(?:i|ey|ello)\b)/i.test(lastContent)

  let shouldSpeak: boolean
  if (input.speakerCount === 0) {
    shouldSpeak = false
  } else {
    shouldSpeak = true
  }

  return {
    shouldSpeak,
    targetUser: input.activeSpeakers[0] || "",
    tone: "neutral",
    emotion: "thoughtful",
    confidence: 0.4,
    reasoning: "Humalike unavailable, using default decision",
  }
}
