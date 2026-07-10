import { ConversationStateManager } from "./conversation-state"
import { StreamingSTT, type TranscriptUpdate } from "./streaming-stt"
import { StreamingTTS, type TTSStatus } from "./streaming-tts"
import { streamLLMResponse } from "@/lib/ai/streaming-llm"
import { predictIntent } from "@/lib/ai/humalike"

const OPENROUTER_API_KEY = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || ""
const OPENROUTER_MODEL = process.env.NEXT_PUBLIC_OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || "poolside/laguna-xs-2.1:free"

async function speakResponse(text: string): Promise<void> {
  try {
    const ttsRes = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (!ttsRes.ok) {
      console.warn("TTS API returned", ttsRes.status)
      await useBrowserTTS(text)
      return
    }
    const audioBlob = await ttsRes.blob()
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    await new Promise<void>((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        resolve()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl)
        resolve()
      }
      audio.play()
    })
  } catch {
    console.warn("TTS API fetch failed")
    await useBrowserTTS(text)
  }
}

function useBrowserTTS(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve()
      return
    }
    // Chrome loads voices asynchronously — wait for them before speaking
    const trySpeak = () => {
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.1
      utterance.pitch = 1.0
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      speechSynthesis.speak(utterance)
    }
    if (speechSynthesis.getVoices().length === 0) {
      speechSynthesis.addEventListener("voiceschanged", trySpeak, { once: true })
      // Safety timeout — speak anyway after 1s even if voices haven't loaded
      setTimeout(trySpeak, 1000)
    } else {
      trySpeak()
    }
  })
}

export type PipelineStatus = "idle" | "listening" | "thinking" | "speaking" | "error"

export interface PipelineCallbacks {
  onStatusChange: (status: PipelineStatus) => void
  onTranscriptUpdate: (update: TranscriptUpdate) => void
  onDebug: (msg: string) => void
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

  constructor(userId: string, username: string, callbacks: PipelineCallbacks) {
    this.userId = userId
    this.username = username
    this.callbacks = callbacks

    this.stateManager = new ConversationStateManager()
    this.stt = new StreamingSTT(this.stateManager, userId, username)
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
    const activeSpeakers = this.stateManager.getActiveSpeakers()
    const speakerCount = this.stateManager.getSpeakerCount()

    try {
      const respondRes = await fetch("/api/ai/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: this.roomId,
          ai_participant_id: this.aiParticipantId,
          ai_name: this.aiName,
          transcript,
          active_speakers: activeSpeakers,
          speaker_count: speakerCount,
        }),
      })

      if (!respondRes.ok) {
        this.callbacks.onDebug(`AI respond failed: ${respondRes.status}`)
        this.isResponding = false
        this.callbacks.onStatusChange("listening")
        return
      }

      const decision = await respondRes.json()

      if (!decision.should_respond) {
        this.callbacks.onDebug(`Silent: ${decision.reason || "no reason"}`)
        this.isResponding = false
        this.callbacks.onStatusChange("listening")
        return
      }

      this.callbacks.onDebug(`Speaking: "${decision.text?.slice(0, 80)}..."`)

      if (decision.text) {
        this.callbacks.onStatusChange("speaking")
        await speakResponse(decision.text)
      }
    } catch (e) {
      this.callbacks.onDebug(`Pipeline error: ${e}`)
    }
    this.isResponding = false
    this.callbacks.onStatusChange("listening")
  }

  private async streamAIResponse(lastUpdate: TranscriptUpdate) {
    if (this.isResponding || !this.roomId || !this.aiParticipantId) return

    this.isResponding = true
    this.callbacks.onStatusChange("thinking")

    const transcript = this.stateManager.getTranscript()
    const activeSpeakers = this.stateManager.getActiveSpeakers()

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
          active_speakers: activeSpeakers,
          speaker_count: this.stateManager.getSpeakerCount(),
        }),
      })

      if (!respondRes.ok) {
        this.callbacks.onDebug(`AI respond failed: ${respondRes.status}`)
        this.isResponding = false
        this.callbacks.onStatusChange("listening")
        return
      }

      const decision = await respondRes.json()

      if (!decision.should_respond) {
        this.callbacks.onDebug(`Silent: ${decision.reason || "no reason"}`)
        this.isResponding = false
        this.callbacks.onStatusChange("listening")
        return
      }

      this.callbacks.onDebug("AI decided to speak, streaming response...")

      this.tts.reset()
      let sentence = ""

      await streamLLMResponse({
        apiKey: OPENROUTER_API_KEY,
        model: OPENROUTER_MODEL,
        systemPrompt: buildSystemPrompt(decision, transcript, activeSpeakers),
        userPrompt: `Respond naturally as ${this.aiName}:`,
        onToken: (token) => {
          sentence += token
          if (/[.!?]/.test(token) || sentence.length > 100) {
            this.tts.enqueue(sentence.trim())
            sentence = ""
          }
        },
        onComplete: (fullText) => {
          if (sentence.trim()) {
            this.tts.enqueue(sentence.trim())
          }

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

          this.callbacks.onDebug(`Response complete: "${fullText.slice(0, 80)}..."`)
        },
        onError: (error) => {
          this.callbacks.onDebug(`LLM error: ${error}`)
          this.isResponding = false
          this.callbacks.onStatusChange("listening")
        },
        signal: this.currentAbortController.signal,
      })
    } catch (e) {
      this.callbacks.onDebug(`Stream error: ${e}`)
      this.isResponding = false
      this.callbacks.onStatusChange("listening")
    }
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

function buildSystemPrompt(
  decision: any,
  transcript: string,
  activeSpeakers: string[]
): string {
  return (
    `You are ${"AI"}, a human-like participant in a voice chat room. ` +
    `You speak naturally, like a friend in the conversation. ` +
    `Current tone: ${decision.tone || "neutral"}. Current emotion: ${decision.emotion || "thoughtful"}. ` +
    `You are responding to ${decision.targetUser || activeSpeakers[0] || "the group"}.` +
    `\n\nRules:` +
    `\n- Respond directly to what was just said. Stay on topic.` +
    `\n- Speak naturally, like a human, not a chatbot.` +
    `\n- Keep responses concise (1-3 sentences).` +
    `\n- Show personality.` +
    `\n- Never introduce yourself.` +
    `\n- Never say "as an AI" or similar.` +
    `\n\nRecent conversation:\n${transcript}`
  )
}
