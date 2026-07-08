import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { SignalingMessage } from "./types"

export class SignalingService {
  private channel: RealtimeChannel | null = null

  subscribe(
    roomCode: string,
    userId: string,
    onMessage: (msg: SignalingMessage) => void
  ) {
    const supabase = createClient()

    this.channel = supabase.channel(`room:${roomCode}`, {
      config: { broadcast: { self: true } },
    })

    this.channel.on(
      "broadcast",
      { event: "signal" },
      ({ payload }: { payload: SignalingMessage }) => {
        onMessage(payload)
      }
    )

    this.channel.subscribe()

    return () => {
      this.channel?.unsubscribe()
      this.channel = null
    }
  }

  async send(message: SignalingMessage) {
    if (!this.channel) return
    await this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: message,
    })
  }

  async announceJoin(userId: string, username: string) {
    await this.send({
      type: "join",
      senderId: userId,
      senderUsername: username,
    })
  }

  async announceLeave(userId: string) {
    await this.send({
      type: "leave",
      senderId: userId,
      senderUsername: "",
    })
  }

  async sendOffer(
    senderId: string,
    senderUsername: string,
    targetId: string,
    sdp: RTCSessionDescriptionInit
  ) {
    await this.send({
      type: "offer",
      senderId,
      senderUsername,
      targetId,
      sdp,
    })
  }

  async sendAnswer(
    senderId: string,
    senderUsername: string,
    targetId: string,
    sdp: RTCSessionDescriptionInit
  ) {
    await this.send({
      type: "answer",
      senderId,
      senderUsername,
      targetId,
      sdp,
    })
  }

  async sendIceCandidate(
    senderId: string,
    targetId: string,
    candidate: RTCIceCandidateInit
  ) {
    await this.send({
      type: "ice-candidate",
      senderId,
      senderUsername: "",
      targetId,
      candidate,
    })
  }
}
