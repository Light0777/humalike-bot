export interface VoicePeer {
  userId: string
  username: string
  connection: RTCPeerConnection
  stream?: MediaStream
  connected: boolean
}

export interface SignalingMessage {
  type: "join" | "leave" | "offer" | "answer" | "ice-candidate" | "ai-state" | "transcript"
  senderId: string
  senderUsername: string
  targetId?: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
  aiEnabled?: boolean
  transcriptText?: string
  transcriptIsFinal?: boolean
}

export interface VoiceState {
  micEnabled: boolean
  speakerEnabled: boolean
  speaking: boolean
  audioLevel: number
}
