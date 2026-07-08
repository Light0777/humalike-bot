/**
 * OpenRouter LLM client.
 *
 * Generates natural responses using the Tencent Hy3 free model.
 * Uses the conversation transcript + Humalike decisions + memory context.
 */

const OPENROUTER_API_URL =
  "https://openrouter.ai/api/v1/chat/completions"
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ""
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "tencent/hy3:free"

interface OpenRouterMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface ResponseInput {
  transcript: string
  aiName: string
  tone: string
  emotion: string
  targetUser: string
  memories: string[]
  familiarity: Record<string, number>
}

export async function generateResponse(
  input: ResponseInput
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    console.warn("OPENROUTER_API_KEY not set, using fallback response")
    return getFallbackResponse(input)
  }

  const systemPrompt = buildSystemPrompt(input)
  const userPrompt = buildUserPrompt(input)

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "humalike-bot Voice Room",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        max_tokens: 150,
        temperature: 0.8,
        top_p: 0.9,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("OpenRouter error:", error)
      return getFallbackResponse(input)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content

    if (!text) {
      return getFallbackResponse(input)
    }

    return text.trim()
  } catch (error) {
    console.error("OpenRouter request failed:", error)
    return getFallbackResponse(input)
  }
}

function buildSystemPrompt(input: ResponseInput): string {
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
    `\n- Speak naturally, like a human, not a chatbot.` +
    `\n- Keep responses concise (1-3 sentences).` +
    `\n- Reference past conversations if relevant.` +
    `\n- Show personality.` +
    `\n- Never introduce yourself.` +
    `\n- Never say "as an AI" or similar.`
  )
}

function buildUserPrompt(input: ResponseInput): string {
  return `Recent conversation:\n${input.transcript}\n\nRespond naturally as ${input.aiName}:`
}

function getFallbackResponse(input: ResponseInput): string {
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
