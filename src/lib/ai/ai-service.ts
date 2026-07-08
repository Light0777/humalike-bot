"use server"

import {
  addParticipant,
  removeParticipant,
  getParticipants,
  updateRoomAI,
} from "@/lib/supabase/service"

const AI_USER_ID = "ai-participant"
const AI_USERNAME = "AI"

export async function addAIToRoom(roomId: string) {
  const existing = await getParticipants(roomId)
  const aiExists = existing.find(
    (p: { user_id: string }) => p.user_id === AI_USER_ID
  )
  if (aiExists) return aiExists

  const ai = await addParticipant(roomId, AI_USER_ID, AI_USERNAME, true)
  await updateRoomAI(roomId, true)
  return ai
}

export async function removeAIFromRoom(roomId: string) {
  const participants = await getParticipants(roomId)
  const ai = participants.find(
    (p: { user_id: string }) => p.user_id === AI_USER_ID
  )
  if (ai) {
    await removeParticipant(ai.id)
  }
  await updateRoomAI(roomId, false)
}
