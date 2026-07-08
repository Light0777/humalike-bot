import { createClient } from "@/lib/supabase/server"

const CONTEXT_WINDOW = 20

interface ChatMessage {
  id: string
  room_id: string
  participant_id: string
  participant_username: string
  content: string
  created_at: string
}

export class ConversationEngine {
  private roomId: string
  private messageCache: ChatMessage[] = []

  constructor(roomId: string) {
    this.roomId = roomId
  }

  async loadHistory(): Promise<ChatMessage[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("conversations")
      .select(
        `
          id,
          room_id,
          participant_id,
          content,
          created_at,
          participants!inner(username)
        `
      )
      .eq("room_id", this.roomId)
      .order("created_at", { ascending: true })
      .limit(100)

    if (error) {
      console.error("Failed to load conversation history:", error)
      return []
    }

    this.messageCache = (data || []).map((msg: Record<string, unknown>) => ({
      id: msg.id as string,
      room_id: msg.room_id as string,
      participant_id: msg.participant_id as string,
      participant_username: (msg.participants as { username: string }).username,
      content: msg.content as string,
      created_at: msg.created_at as string,
    }))

    return this.messageCache
  }

  async addMessage(
    participantId: string,
    participantUsername: string,
    content: string
  ): Promise<ChatMessage> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        room_id: this.roomId,
        participant_id: participantId,
        content,
      })
      .select()
      .single()

    if (error) {
      console.error("Failed to save message:", error)
      throw error
    }

    const message: ChatMessage = {
      id: data.id,
      room_id: data.room_id,
      participant_id: data.participant_id,
      participant_username: participantUsername,
      content: data.content,
      created_at: data.created_at,
    }

    this.messageCache.push(message)
    return message
  }

  getTranscript(): string {
    const window = this.messageCache.slice(-CONTEXT_WINDOW)
    return window
      .map(
        (m) => `${m.participant_username}: ${m.content}`
      )
      .join("\n")
  }

  getActiveSpeakers(): string[] {
    const recent = this.messageCache.slice(-10)
    const speakerCount = new Map<string, number>()

    for (const msg of recent) {
      speakerCount.set(
        msg.participant_username,
        (speakerCount.get(msg.participant_username) || 0) + 1
      )
    }

    return [...speakerCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)
  }

  getContextWindow(limit: number = CONTEXT_WINDOW): ChatMessage[] {
    return this.messageCache.slice(-limit)
  }

  getMessageCount(): number {
    return this.messageCache.length
  }
}
