type Listener = () => void

export interface SpeakerState {
  userId: string
  username: string
  isSpeaking: boolean
  speechStart: number | null
  speechEnd: number | null
  lastTranscript: string
  partialTranscript: string
  confidence: number
}

export interface ConversationState {
  speakers: Map<string, SpeakerState>
  activeSpeakerId: string | null
  silenceDuration: number
  transcript: string
}

export class ConversationStateManager {
  private state: ConversationState = {
    speakers: new Map(),
    activeSpeakerId: null,
    silenceDuration: 0,
    transcript: "",
  }

  private listeners = new Map<string, Set<Listener>>()
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private lastSpeechTime = Date.now()

  on(event: "speechStart" | "speechEnd" | "transcriptUpdate" | "silence" | "interruption", listener: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
    return () => this.listeners.get(event)?.delete(listener)
  }

  private emit(event: string) {
    this.listeners.get(event)?.forEach((l) => l())
  }

  getState(): Readonly<ConversationState> {
    return this.state
  }

  getActiveSpeaker(): SpeakerState | null {
    if (!this.state.activeSpeakerId) return null
    return this.state.speakers.get(this.state.activeSpeakerId) ?? null
  }

  addSpeaker(userId: string, username: string) {
    if (this.state.speakers.has(userId)) return
    this.state.speakers.set(userId, {
      userId,
      username,
      isSpeaking: false,
      speechStart: null,
      speechEnd: null,
      lastTranscript: "",
      partialTranscript: "",
      confidence: 0,
    })
  }

  startSpeaking(userId: string, username: string) {
    this.addSpeaker(userId, username)
    const speaker = this.state.speakers.get(userId)!

    // Interruption: if another user was speaking, end their turn
    if (this.state.activeSpeakerId && this.state.activeSpeakerId !== userId) {
      this.endSpeaking(this.state.activeSpeakerId)
      this.emit("interruption")
    }

    speaker.isSpeaking = true
    speaker.speechStart = Date.now()
    speaker.speechEnd = null
    this.state.activeSpeakerId = userId
    this.lastSpeechTime = Date.now()

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }

    this.emit("speechStart")
  }

  updateTranscript(userId: string, text: string, confidence: number, isFinal: boolean) {
    const speaker = this.state.speakers.get(userId)
    if (!speaker) return

    speaker.partialTranscript = text
    speaker.confidence = confidence
    speaker.lastTranscript = text

    if (isFinal) {
      this.state.transcript += `${speaker.username}: ${text}\n`
    }

    this.emit("transcriptUpdate")
  }

  endSpeaking(userId: string) {
    const speaker = this.state.speakers.get(userId)
    if (!speaker) return

    speaker.isSpeaking = false
    speaker.speechEnd = Date.now()
    this.lastSpeechTime = Date.now()

    if (this.state.activeSpeakerId === userId) {
      this.state.activeSpeakerId = null
    }

    this.emit("speechEnd")

    this.silenceTimer = setTimeout(() => {
      this.state.silenceDuration = Date.now() - this.lastSpeechTime
      this.emit("silence")
    }, 500)
  }

  getTranscript(): string {
    return this.state.transcript
  }

  getActiveSpeakers(): string[] {
    const result: string[] = []
    this.state.speakers.forEach((s) => {
      if (s.isSpeaking) {
        result.push(s.username)
      }
    })
    if (result.length === 0 && this.state.activeSpeakerId) {
      const s = this.state.speakers.get(this.state.activeSpeakerId)
      if (s) result.push(s.username)
    }
    return result
  }

  getSpeakerCount(): number {
    return this.state.speakers.size
  }

  hasActiveSpeaker(): boolean {
    return this.state.activeSpeakerId !== null
  }

  getSpeaker(userId: string): SpeakerState | undefined {
    return this.state.speakers.get(userId)
  }

  removeSpeaker(userId: string) {
    this.state.speakers.delete(userId)
    if (this.state.activeSpeakerId === userId) {
      this.state.activeSpeakerId = null
    }
  }

  reset() {
    this.state.speakers.clear()
    this.state.activeSpeakerId = null
    this.state.silenceDuration = 0
    this.state.transcript = ""
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
  }
}
