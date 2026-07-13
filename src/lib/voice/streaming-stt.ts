import { ConversationStateManager } from "./conversation-state"
import { VoiceActivityDetector } from "./voice-activity"

declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

export interface TranscriptUpdate {
  text: string
  isFinal: boolean
  confidence: number
  userId: string
  username: string
}

export type TranscriptCallback = (update: TranscriptUpdate) => void
export type ErrorCallback = (error: string) => void
export type StatusCallback = (status: "listening" | "idle" | "error" | "no-mic") => void

export class StreamingSTT {
  private recognition: SpeechRecognition | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private stateManager: ConversationStateManager
  private userId: string
  private username: string
  private isRunning = false
  private cleanup = false

  private backoffDelay = 100
  private readonly maxBackoffDelay = 10000
  private vad: VoiceActivityDetector | null = null
  private audioStream: MediaStream | null = null

  onTranscript: TranscriptCallback | null = null
  onError: ErrorCallback | null = null
  onStatus: StatusCallback | null = null

  private SpeechRecognitionAPI =
    typeof window !== "undefined"
      ? (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
      : undefined

  constructor(
    stateManager: ConversationStateManager,
    userId: string,
    username: string,
    audioStream?: MediaStream
  ) {
    this.stateManager = stateManager
    this.userId = userId
    this.username = username
    if (audioStream) {
      this.setAudioStream(audioStream)
    }
  }

  setAudioStream(stream: MediaStream) {
    this.audioStream = stream
    this.vad?.stop()
    this.vad = new VoiceActivityDetector(10, 400)
    this.vad.onVAD = (event) => {
      if (event.speaking && !this.stateManager.hasActiveSpeaker()) {
        this.stateManager.startSpeaking(this.userId, this.username)
      }
    }
  }

  get isAvailable(): boolean {
    return !!this.SpeechRecognitionAPI
  }

  start() {
    if (!this.SpeechRecognitionAPI) {
      this.onError?.("SpeechRecognition not available")
      this.onStatus?.("error")
      return
    }

    this.cleanup = false
    this.resetBackoff()
    if (this.vad && this.audioStream) {
      this.vad.start(this.audioStream)
    }
    this.startRecognition()
  }

  stop() {
    this.cleanup = true
    this.vad?.stop()
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.recognition) {
      try {
        this.recognition.abort()
      } catch { }
      this.recognition = null
    }
    this.isRunning = false
  }

  private resetBackoff() {
    this.backoffDelay = 100
  }

  private getNextBackoff(): number {
    const delay = this.backoffDelay
    this.backoffDelay = Math.min(
      Math.round(this.backoffDelay * 2.5),
      this.maxBackoffDelay
    )
    return delay
  }

  private scheduleRestart() {
    if (this.cleanup) return
    const delay = this.getNextBackoff()
    this.restartTimer = setTimeout(() => this.startRecognition(), delay)
  }

  private startRecognition() {
    if (this.cleanup) return

    const recognition = new this.SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    this.recognition = recognition

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.resetBackoff()
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        const confidence = result[0].confidence
        const isFinal = result.isFinal

        if (isFinal) {
          this.stateManager.endSpeaking(this.userId)
          this.stateManager.updateTranscript(this.userId, text, confidence, true)
        } else {
          if (!this.stateManager.hasActiveSpeaker()) {
            this.stateManager.startSpeaking(this.userId, this.username)
          }
          this.stateManager.updateTranscript(this.userId, text, confidence, false)
        }

        this.onTranscript?.({
          text,
          isFinal,
          confidence,
          userId: this.userId,
          username: this.username,
        })
      }
    }

    recognition.onerror = (event: { error: string }) => {
      if (event.error === "not-allowed") {
        this.onStatus?.("no-mic")
        return
      }
      if (event.error !== "aborted") {
        this.onError?.(event.error)
        this.scheduleRestart()
      }
    }

    recognition.onend = () => {
      this.isRunning = false
      this.recognition = null
      if (!this.cleanup) {
        this.scheduleRestart()
      }
    }

    try {
      recognition.start()
      this.isRunning = true
      this.onStatus?.("listening")
    } catch (e) {
      this.onError?.(`STT start failed: ${e}`)
      this.scheduleRestart()
    }
  }
}
