import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { SignalingMessage } from "./types"

export class SignalingService {
  private channel: RealtimeChannel | null = null
  private ready = false
  private pending: SignalingMessage[] = []

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

    this.channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
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
}
