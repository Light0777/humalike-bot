import { ConversationStateManager } from "./conversation-state"
import { StreamingSTT, type TranscriptUpdate } from "./streaming-stt"
import { StreamingTTS, type TTSStatus } from "./streaming-tts"
import { predictIntent } from "@/lib/ai/humalike"

export type PipelineStatus = "idle" | "listening" | "thinking" | "speaking" | "error"

export interface PipelineCallbacks {
  onStatusChange: (status: PipelineStatus) => void
  onTranscriptUpdate: (update: TranscriptUpdate) => void
  onDebug: (msg: string) => void
  onSTTStatus?: (status: "listening" | "idle" | "error" | "no-mic") => void
}

export class VoicePipeline {
  private stateManager: ConversationStateManager
  private stt: StreamingSTT
  private tts: StreamingTTS
  private callbacks: PipelineCallbacks

  private currentAbortController: AbortController | null = null
  private isResponding = false
  private userId: string
  private username: string
  private roomId: string | null = null
  private aiParticipantId: string | null = null
  private aiName = "AI"

  constructor(
    userId: string,
    username: string,
    callbacks: PipelineCallbacks,
    audioStream?: MediaStream
  ) {
    this.userId = userId
    this.username = username
    this.callbacks = callbacks

    this.stateManager = new ConversationStateManager()
    this.stt = new StreamingSTT(this.stateManager, userId, username, audioStream)
    this.tts = new StreamingTTS()

    this.setupSTTCallbacks()
    this.setupTTSCallbacks()
    this.setupStateCallbacks()
  }

  private earlyIntentTimer: ReturnType<typeof setTimeout> | null = null

  private setupSTTCallbacks() {
    this.stt.onTranscript = (update: TranscriptUpdate) => {
      this.callbacks.onTranscriptUpdate(update)

      // Early intent prediction on partial transcripts
      if (!update.isFinal && !this.isResponding) {
        const intent = predictIntent(update.text)
        if (intent.likelyWantsResponse && intent.confidence > 0.7) {
          this.callbacks.onDebug(
            `Early intent: ${intent.predictedType} (conf=${intent.confidence})`
          )
          // Signal readiness — could pre-warm LLM here in future
        }
      }

      // Only trigger full response on final transcript
      if (update.isFinal && !this.isResponding) {
        this.triggerAIResponse(update)
      }
    }

    this.stt.onError = (error: string) => {
      this.callbacks.onDebug(`STT error: ${error}`)
    }

    this.stt.onStatus = (status) => {
      this.callbacks.onSTTStatus?.(status)
      if (status === "listening") {
        this.callbacks.onStatusChange("listening")
      }
    }
  }

  private setupTTSCallbacks() {
    this.tts.onStatusChange = (status: TTSStatus) => {
      if (status === "idle") {
        this.callbacks.onStatusChange("listening")
        this.isResponding = false
      } else if (status === "speaking") {
        this.callbacks.onStatusChange("speaking")
      }
    }
  }

  private setupStateCallbacks() {
    this.stateManager.on("interruption", () => {
      this.callbacks.onDebug("Interruption detected")

      if (this.currentAbortController) {
        this.currentAbortController.abort()
        this.currentAbortController = null
      }

      this.tts.pause()
    })

    this.stateManager.on("silence", () => {
      this.callbacks.onDebug("Silence period detected")
    })
  }

  get stateManagerInstance(): ConversationStateManager {
    return this.stateManager
  }

  setRoomContext(roomId: string, aiParticipantId: string, aiName: string) {
    this.roomId = roomId
    this.aiParticipantId = aiParticipantId
    this.aiName = aiName
  }

  async simulateTranscript(text: string) {
    const update: TranscriptUpdate = {
      text,
      isFinal: true,
      confidence: 1.0,
      userId: this.userId,
      username: this.username,
    }

    this.stateManager.startSpeaking(this.userId, this.username)
    this.stateManager.updateTranscript(this.userId, text, 1.0, true)
    this.stateManager.endSpeaking(this.userId)

    this.callbacks.onTranscriptUpdate(update)

    if (!this.isResponding) {
      this.triggerAIResponse(update)
    }
  }

  injectRemoteTranscript(
    remoteUserId: string,
    remoteUsername: string,
    text: string,
    isFinal: boolean
  ) {
    const update: TranscriptUpdate = {
      text,
      isFinal,
      confidence: 1.0,
      userId: remoteUserId,
      username: remoteUsername,
    }

    this.stateManager.startSpeaking(remoteUserId, remoteUsername)
    this.stateManager.updateTranscript(remoteUserId, text, 1.0, isFinal)
    this.stateManager.endSpeaking(remoteUserId)

    this.callbacks.onTranscriptUpdate(update)

    if (isFinal && !this.isResponding) {
      this.triggerAIResponse(update)
    }
  }

  async start() {
    this.stt.start()
  }

  stop() {
    this.stt.stop()
    this.tts.cancel()
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
    this.isResponding = false
  }

  private async triggerAIResponse(lastUpdate: TranscriptUpdate) {
    if (this.isResponding || !this.roomId || !this.aiParticipantId) return

    this.isResponding = true
    this.callbacks.onStatusChange("thinking")

    const transcript = this.stateManager.getTranscript()
    const messages = this.stateManager.getTranscriptMessages()
    const activeSpeakers = this.stateManager.getActiveSpeakers()
    const speakerCount = this.stateManager.getSpeakerCount()

    this.currentAbortController = new AbortController()

    try {
      const respondRes = await fetch("/api/ai/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: this.roomId,
          ai_participant_id: this.aiParticipantId,
          ai_name: this.aiName,
          transcript,
          messages,
          active_speakers: activeSpeakers,
          speaker_count: speakerCount,
        }),
        signal: this.currentAbortController.signal,
      })

      if (!respondRes.ok) {
        this.callbacks.onDebug(`AI respond failed: ${respondRes.status}`)
        this.isResponding = false
        this.callbacks.onStatusChange("listening")
        return
      }

      // Read SSE stream
      const contentType = respondRes.headers.get("content-type") || ""
      if (!contentType.includes("text/event-stream")) {
        // Non-streaming response (silence decision)
        const decision = await respondRes.json()
        if (!decision.should_respond) {
          this.callbacks.onDebug(`Silent: ${decision.reason || "no reason"}`)
        }
        this.isResponding = false
        this.callbacks.onStatusChange("listening")
        return
      }

      // Streaming SSE response
      const reader = respondRes.body?.getReader()
      if (!reader) {
        this.isResponding = false
        this.callbacks.onStatusChange("listening")
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""
      let fullText = ""
      let sentence = ""
      let hasDecidedToSpeak = false

      this.tts.reset()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split("\n\n")
        buffer = parts.pop() || ""

        for (const part of parts) {
          const lines = part.split("\n")
          let eventType = ""
          let dataStr = ""

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7)
            else if (line.startsWith("data: ")) dataStr = line.slice(6)
          }

          if (!dataStr) continue

          if (eventType === "decision") {
            const d = JSON.parse(dataStr)
            if (!d.should_respond) {
              this.callbacks.onDebug(`Silent: ${d.reason || "no reason"}`)
              this.isResponding = false
              this.callbacks.onStatusChange("listening")
              return
            }
            hasDecidedToSpeak = true
            this.callbacks.onStatusChange("speaking")
          } else if (eventType === "token") {
            const { token } = JSON.parse(dataStr)
            if (token) {
              fullText += token
              sentence += token
              if (/[.!?]/.test(token) || sentence.length > 100) {
                this.tts.enqueue(sentence.trim())
                sentence = ""
              }
            }
          } else if (eventType === "done") {
            const { text: doneText } = JSON.parse(dataStr)
            if (sentence.trim()) {
              this.tts.enqueue(sentence.trim())
            }

            if (doneText) {
              fullText = doneText
              this.callbacks.onDebug(`Response complete: "${fullText.slice(0, 80)}..."`)

              // Inject AI's own speech into conversation state
              const aiId = this.aiParticipantId || "ai-assistant"
              this.stateManager.startSpeaking(aiId, this.aiName)
              this.stateManager.updateTranscript(aiId, fullText, 1.0, true)
              this.stateManager.endSpeaking(aiId)

              // Save to DB (fire-and-forget)
              fetch("/api/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  room_id: this.roomId,
                  participant_id: this.aiParticipantId,
                  participant_username: this.aiName,
                  content: fullText,
                }),
              }).catch(() => {})
            }
          } else if (eventType === "error") {
            const { message } = JSON.parse(dataStr)
            this.callbacks.onDebug(`Stream error: ${message}`)
          }
        }
      }
    } catch (e) {
      this.callbacks.onDebug(`Pipeline error: ${e}`)
    }
    this.isResponding = false
    this.callbacks.onStatusChange("listening")
  }

  interrupt() {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
    this.tts.pause()
    this.isResponding = false
    this.callbacks.onStatusChange("listening")
  }
}


