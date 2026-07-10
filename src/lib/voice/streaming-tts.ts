export type TTSStatus = "idle" | "speaking" | "paused"

export class StreamingTTS {
  private utterance: SpeechSynthesisUtterance | null = null
  private status: TTSStatus = "idle"
  private sentenceBuffer: string[] = []
  private isPlaying = false
  private cancelled = false

  onStatusChange: ((status: TTSStatus) => void) | null = null

  private speakNext() {
    if (this.cancelled || this.sentenceBuffer.length === 0 || this.isPlaying) return

    const text = this.sentenceBuffer.shift()!
    this.isPlaying = true
    this.status = "speaking"
    this.onStatusChange?.("speaking")

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.1
    utterance.pitch = 1.0
    this.utterance = utterance

    utterance.onend = () => {
      this.isPlaying = false
      this.utterance = null
      if (this.sentenceBuffer.length > 0) {
        this.speakNext()
      } else {
        this.status = "idle"
        this.onStatusChange?.("idle")
      }
    }

    utterance.onerror = () => {
      this.isPlaying = false
      this.utterance = null
      this.speakNext()
    }

    speechSynthesis.speak(utterance)
  }

  enqueue(text: string) {
    if (this.cancelled) return
    this.sentenceBuffer.push(text)
    if (!this.isPlaying) {
      this.speakNext()
    }
  }

  enqueueTokens(tokens: string[]) {
    let sentence = ""
    for (const token of tokens) {
      sentence += token
      if (/[.!?]/.test(token) || sentence.length > 100) {
        this.enqueue(sentence.trim())
        sentence = ""
      }
    }
    if (sentence.trim()) {
      this.enqueue(sentence.trim())
    }
  }

  pause() {
    if (this.status === "speaking") {
      speechSynthesis.pause()
      this.status = "paused"
      this.onStatusChange?.("paused")
    }
  }

  resume() {
    if (this.status === "paused") {
      speechSynthesis.resume()
      this.status = "speaking"
      this.onStatusChange?.("speaking")
    }
  }

  cancel() {
    this.cancelled = true
    this.sentenceBuffer = []
    this.isPlaying = false
    if (this.utterance) {
      speechSynthesis.cancel()
      this.utterance = null
    }
    this.status = "idle"
    this.onStatusChange?.("idle")
  }

  reset() {
    this.cancel()
    this.cancelled = false
  }

  getStatus(): TTSStatus {
    return this.status
  }
}
