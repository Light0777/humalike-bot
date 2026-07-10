import { ConversationStateManager } from "./conversation-state"

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
export type StatusCallback = (status: "listening" | "idle" | "error") => void

export class StreamingSTT {
  private recognition: SpeechRecognition | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private stateManager: ConversationStateManager
  private userId: string
  private username: string
  private isRunning = false
  private cleanup = false

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
    username: string
  ) {
    this.stateManager = stateManager
    this.userId = userId
    this.username = username
  }

  get isAvailable(): boolean {
    return !!this.SpeechRecognitionAPI
  }

  start() {
    if (!this.SpeechRecognitionAPI) {
      this.onError?.("SpeechRecognition not available")
      return
    }

    this.cleanup = false
    this.startRecognition()
  }

  stop() {
    this.cleanup = true
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

  private startRecognition() {
    if (this.cleanup) return

    const recognition = new this.SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    this.recognition = recognition

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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
      if (event.error !== "aborted" && event.error !== "no-speech") {
        this.onError?.(event.error)
      }
      if (event.error === "not-allowed") {
        this.onStatus?.("error")
        return
      }
    }

    recognition.onend = () => {
      this.isRunning = false
      this.recognition = null
      if (!this.cleanup) {
        this.restartTimer = setTimeout(() => this.startRecognition(), 100)
      }
    }

    try {
      recognition.start()
      this.isRunning = true
      this.onStatus?.("listening")
    } catch (e) {
      this.onError?.(`STT start failed: ${e}`)
      this.onStatus?.("error")
    }
  }
}
