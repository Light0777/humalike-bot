export interface User {
  id: string
  username: string
  created_at: string
}

export interface Room {
  id: string
  code: string
  name: string
  created_at: string
  ai_enabled: boolean
}

export interface Participant {
  id: string
  room_id: string
  user_id: string
  username: string
  is_ai: boolean
  joined_at: string
}

export interface Conversation {
  id: string
  room_id: string
  participant_id: string
  content: string
  created_at: string
}

export interface Relationship {
  id: string
  participant_id: string
  target_id: string
  familiarity: number
  trust: number
  opinion: string
  updated_at: string
}

export interface Memory {
  id: string
  participant_id: string
  content: string
  type: "conversation_summary" | "fact" | "opinion" | "joke" | "inside_joke"
  importance: number
  created_at: string
}

export type AIStatus = "idle" | "listening" | "thinking" | "speaking"
