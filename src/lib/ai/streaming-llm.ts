const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

export interface LLMOptions {
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
  onToken: (token: string) => void
  onComplete: (fullText: string) => void
  onError: (error: string) => void
  signal?: AbortSignal
}

export async function streamLLMResponse(options: LLMOptions): Promise<void> {
  const {
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    onToken,
    onComplete,
    onError,
    signal,
  } = options

  if (!apiKey) {
    onError("API key not set")
    return
  }

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ]

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "humalike-bot Voice Room",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 80,
        temperature: 0.9,
        top_p: 0.9,
      }),
      signal,
    })

    if (!response.ok) {
      const error = await response.text()
      onError(`OpenRouter ${response.status}: ${error.slice(0, 200)}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      onError("No response body")
      return
    }

    const decoder = new TextDecoder()
    let buffer = ""
    let fullText = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data: ")) continue

        const data = trimmed.slice(6)
        if (data === "[DONE]") continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullText += content
            onToken(content)
          }
        } catch { }
      }
    }

    onComplete(fullText.trim())
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return
    }
    onError(`Stream failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}
