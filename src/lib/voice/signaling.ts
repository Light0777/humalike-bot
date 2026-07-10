import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { SignalingMessage } from "./types"

export class SignalingService {
  private channel: RealtimeChannel | null = null
  private ready = false
  private pending: SignalingMessage[] = []
  private knownPeers = new Set<string>()
  private onMessage: ((msg: SignalingMessage) => void) | null = null
  private onParticipants: ((participants: { userId: string; username: string }[]) => void) | null = null

  subscribe(
    roomCode: string,
    userId: string,
    username: string,
    onMessage: (msg: SignalingMessage) => void,
    onParticipants?: (participants: { userId: string; username: string }[]) => void
  ) {
    this.onMessage = onMessage
    this.onParticipants = onParticipants ?? null
    const supabase = createClient()

    this.channel = supabase.channel(`room:${roomCode}`, {
      config: { broadcast: { self: true } },
    })

    // Broadcast messages (offers, answers, ICE, AI state, transcripts)
    this.channel.on(
      "broadcast",
      { event: "signal" },
      ({ payload }: { payload: SignalingMessage }) => {
        onMessage(payload)
      }
    )

    // Presence tracking for participant discovery
    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel?.presenceState()
      if (!state) return
      const participants: { userId: string; username: string }[] = []
      const currentIds = new Set<string>()
      for (const [, presences] of Object.entries(state)) {
        for (const raw of presences as Record<string, unknown>[]) {
          const p = raw as { userId?: string; username?: string }
          if (p.userId && p.userId !== userId) {
            currentIds.add(p.userId)
            participants.push({ userId: p.userId, username: p.username ?? "" })
            if (!this.knownPeers.has(p.userId)) {
              this.knownPeers.add(p.userId)
              onMessage({
                type: "join",
                senderId: p.userId,
                senderUsername: p.username ?? "",
              })
            }
          }
        }
      }
      // Detect leavers
      for (const knownId of this.knownPeers) {
        if (!currentIds.has(knownId)) {
          this.knownPeers.delete(knownId)
          onMessage({
            type: "leave",
            senderId: knownId,
            senderUsername: "",
          })
        }
      }
      onParticipants?.(participants)
    })

    this.channel.on("presence", { event: "join" }, ({ newPresences }) => {
      for (const raw of newPresences as Record<string, unknown>[]) {
        const p = raw as { userId?: string; username?: string }
        if (p.userId && p.userId !== userId && !this.knownPeers.has(p.userId)) {
          this.knownPeers.add(p.userId)
          onMessage({
            type: "join",
            senderId: p.userId,
            senderUsername: p.username ?? "",
          })
        }
      }
    })

    this.channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
      for (const raw of leftPresences as Record<string, unknown>[]) {
        const p = raw as { userId?: string }
        if (p.userId) {
          this.knownPeers.delete(p.userId)
          onMessage({
            type: "leave",
            senderId: p.userId,
            senderUsername: "",
          })
        }
      }
    })

    this.channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await this.channel?.track({ userId, username, onlineAt: new Date().toISOString() })
        this.ready = true
        for (const msg of this.pending) {
          this.doSend(msg)
        }
        this.pending = []
      }
    })

    return () => {
      this.channel?.unsubscribe()
      this.channel = null
      this.ready = false
      this.pending = []
      this.knownPeers.clear()
      this.onMessage = null
      this.onParticipants = null
    }
  }

  private doSend(message: SignalingMessage) {
    if (!this.channel) return
    this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: message,
    })
  }

  private send(message: SignalingMessage) {
    if (this.ready) {
      this.doSend(message)
    } else {
      this.pending.push(message)
    }
  }

  announceJoin(userId: string, username: string) {
    // Presence tracking handles join detection now
    // But we still send a broadcast for backward compat / immediate signal
    this.send({
      type: "join",
      senderId: userId,
      senderUsername: username,
    })
  }

  announceLeave(userId: string) {
    this.send({
      type: "leave",
      senderId: userId,
      senderUsername: "",
    })
  }

  sendOffer(
    senderId: string,
    senderUsername: string,
    targetId: string,
    sdp: RTCSessionDescriptionInit
  ) {
    this.send({
      type: "offer",
      senderId,
      senderUsername,
      targetId,
      sdp,
    })
  }

  sendAnswer(
    senderId: string,
    senderUsername: string,
    targetId: string,
    sdp: RTCSessionDescriptionInit
  ) {
    this.send({
      type: "answer",
      senderId,
      senderUsername,
      targetId,
      sdp,
    })
  }

  sendIceCandidate(
    senderId: string,
    targetId: string,
    candidate: RTCIceCandidateInit
  ) {
    this.send({
      type: "ice-candidate",
      senderId,
      senderUsername: "",
      targetId,
      candidate,
    })
  }

  announceAIState(userId: string, username: string, enabled: boolean) {
    this.send({
      type: "ai-state",
      senderId: userId,
      senderUsername: username,
      aiEnabled: enabled,
    })
  }

  sendTranscript(
    userId: string,
    username: string,
    text: string,
    isFinal: boolean
  ) {
    this.send({
      type: "transcript",
      senderId: userId,
      senderUsername: username,
      transcriptText: text,
      transcriptIsFinal: isFinal,
    })
  }
}
