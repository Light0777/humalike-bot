const HUMALIKE_API_URL = "https://api.humalike.com"
const HUMALIKE_API_KEY = process.env.HUMALIKE_API_KEY || ""

interface ThreadState {
  threadId: string
  turnEpoch: number
}

const threadStore = new Map<string, ThreadState>()

export function getThreadState(roomId: string): ThreadState | undefined {
  return threadStore.get(roomId)
}

export async function openThread(roomId: string): Promise<void> {
  if (!HUMALIKE_API_KEY) return

  try {
    const res = await fetch(
      `${HUMALIKE_API_URL}/v1/turn-taking/actions/open_thread`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${HUMALIKE_API_KEY}`,
        },
        body: JSON.stringify({ thread_id: roomId }),
      }
    )

    if (!res.ok) {
      console.warn("Humalike open_thread failed:", res.status)
      return
    }

    const data = await res.json()
    threadStore.set(roomId, {
      threadId: data.thread.id,
      turnEpoch: 0,
    })
  } catch {
    console.warn("Humalike open_thread unavailable")
  }
}

interface TurnMessage {
  sender: string
  content: string
}

interface SubmitResult {
  decision: "speak" | "stay_silent"
  turnEpoch: number
  tags: string[]
}

export async function submitMessages(
  roomId: string,
  messages: TurnMessage[]
): Promise<SubmitResult | null> {
  if (!HUMALIKE_API_KEY) {
    console.error("HUMALIKE_API_KEY is not set in env")
    return null
  }

  let state = threadStore.get(roomId)

  if (!state) {
    await openThread(roomId)
    state = threadStore.get(roomId)
    if (!state) return null
  }

  try {
    const res = await fetch(
      `${HUMALIKE_API_URL}/v1/turn-taking/actions/submit_messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${HUMALIKE_API_KEY}`,
        },
        body: JSON.stringify({
          thread_id: state.threadId,
          messages: messages.map((m) => ({
            sender: m.sender,
            content: m.content,
          })),
        }),
      }
    )

    if (!res.ok) {
      console.warn("Humalike submit_messages failed:", res.status)
      return null
    }

    const data = await res.json()
    state.turnEpoch = data.turn_epoch ?? 0
    return {
      decision: data.decision,
      turnEpoch: data.turn_epoch ?? 0,
      tags: data.tags ?? [],
    }
  } catch {
    console.warn("Humalike submit_messages unavailable")
    return null
  }
}
