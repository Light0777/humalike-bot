import { createClient } from "@/lib/supabase/server"

export class MemoryService {
  private participantId: string

  constructor(participantId: string) {
    this.participantId = participantId
  }

  async updateRelationship(
    targetId: string,
    delta: { familiarity?: number; trust?: number; opinion?: string }
  ) {
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from("relationships")
      .select("*")
      .eq("participant_id", this.participantId)
      .eq("target_id", targetId)
      .single()

    if (existing) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (delta.familiarity !== undefined) {
        updates.familiarity = Math.min(
          1,
          Math.max(0, existing.familiarity + delta.familiarity)
        )
      }
      if (delta.trust !== undefined) {
        updates.trust = Math.min(
          1,
          Math.max(0, existing.trust + delta.trust)
        )
      }
      if (delta.opinion !== undefined) {
        updates.opinion = delta.opinion
      }

      await supabase
        .from("relationships")
        .update(updates)
        .eq("id", existing.id)
    } else {
      await supabase.from("relationships").insert({
        participant_id: this.participantId,
        target_id: targetId,
        familiarity: delta.familiarity ?? 0.1,
        trust: delta.trust ?? 0.5,
        opinion: delta.opinion ?? "",
      })
    }
  }

  async addMemory(
    content: string,
    type: "conversation_summary" | "fact" | "opinion" | "joke" | "inside_joke",
    importance: number = 0.5
  ) {
    const supabase = await createClient()

    await supabase.from("memories").insert({
      participant_id: this.participantId,
      content,
      type,
      importance,
    })
  }

  async recallMemories(limit: number = 10): Promise<string[]> {
    const supabase = await createClient()

    const { data } = await supabase
      .from("memories")
      .select("content, importance, created_at")
      .eq("participant_id", this.participantId)
      .order("importance", { ascending: false })
      .limit(limit)

    return (data || []).map((m: { content: string }) => m.content)
  }

  async getFamiliarity(
    targetId: string
  ): Promise<{ familiarity: number; trust: number; opinion: string }> {
    const supabase = await createClient()

    const { data } = await supabase
      .from("relationships")
      .select("familiarity, trust, opinion")
      .eq("participant_id", this.participantId)
      .eq("target_id", targetId)
      .single()

    return {
      familiarity: data?.familiarity ?? 0,
      trust: data?.trust ?? 0.5,
      opinion: data?.opinion ?? "",
    }
  }

  async getAllRelationships(): Promise<
    { targetId: string; username: string; familiarity: number; trust: number }[]
  > {
    const supabase = await createClient()

    const { data: rels } = await supabase
      .from("relationships")
      .select("target_id, familiarity, trust")
      .eq("participant_id", this.participantId)

    if (!rels) return []

    const result = []
    for (const rel of rels) {
      const { data: participant } = await supabase
        .from("participants")
        .select("username")
        .eq("id", rel.target_id)
        .single()
      result.push({
        targetId: rel.target_id,
        username: participant?.username ?? "Unknown",
        familiarity: rel.familiarity,
        trust: rel.trust,
      })
    }
    return result
  }

  async onUserSpoke(
    speakerId: string,
    content: string
  ) {
    // Small familiarity boost when someone speaks
    await this.updateRelationship(speakerId, {
      familiarity: 0.05,
    })

    // If the message is notable, store it as a memory
    const notableKeywords = [
      "remember",
      "joke",
      "funny",
      "last time",
      "you said",
      "inside",
    ]
    const isNotable = notableKeywords.some((kw) =>
      content.toLowerCase().includes(kw)
    )

    if (isNotable && content.length > 20) {
      await this.addMemory(content, "fact", 0.7)
    }
  }
}
