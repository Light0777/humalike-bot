import { createClient } from "./server"

export async function createRoom(code: string, name: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("rooms")
    .insert({ code, name })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getRoom(code: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code)
    .single()
  if (error) return null
  return data
}

export async function addParticipant(
  roomId: string,
  userId: string,
  username: string,
  isAi = false
) {
  const supabase = await createClient()
  // Upsert: avoid duplicates from StrictMode double-invocation
  const { data: existing } = await supabase
    .from("participants")
    .select("id, username, is_ai")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle()
  if (existing) {
    const { data, error } = await supabase
      .from("participants")
      .update({ username, is_ai: isAi, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase
    .from("participants")
    .insert({ room_id: roomId, user_id: userId, username, is_ai: isAi })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getParticipants(roomId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("room_id", roomId)
  if (error) throw error
  return data
}

export async function removeParticipant(participantId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("participants")
    .delete()
    .eq("id", participantId)
  if (error) throw error
}

export async function updateRoomAI(roomId: string, enabled: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rooms")
    .update({ ai_enabled: enabled })
    .eq("id", roomId)
  if (error) throw error
}
