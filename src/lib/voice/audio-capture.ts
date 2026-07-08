/**
 * Captures audio chunks from a MediaStream and sends them for transcription.
 * Uses a simple approach: records small chunks and sends the latest one
 * when speech activity is detected, with cooldown to avoid duplicates.
 */

type TranscriptionCallback = (text: string, userId: string) => void

interface AudioCaptureOptions {
  stream: MediaStream
  userId: string
  onTranscription: TranscriptionCallback
  chunkDurationMs?: number
  silenceThreshold?: number
  minSpeechDurationMs?: number
}

export class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private speaking = false
  private silenceStart = 0
  private lastTranscription = ""
  private options: AudioCaptureOptions
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null
  private audioContext: AudioContext | null = null
  private animationFrame: number = 0
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: AudioCaptureOptions) {
    this.options = options
  }

  start() {
    const { stream, chunkDurationMs = 3000 } = this.options

    // Set up audio level detection
    this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)

    // Set up MediaRecorder for periodic audio capture
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm"

    this.mediaRecorder = new MediaRecorder(stream, { mimeType })

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data)
      }
    }

    this.mediaRecorder.start(chunkDurationMs)

    // Periodically check for speech and transcribe
    this.animationFrame = requestAnimationFrame(
      this.checkAudioLevel.bind(this)
    )
  }

  private checkAudioLevel() {
    if (!this.analyser || !this.dataArray) return

    this.analyser.getByteFrequencyData(this.dataArray)
    const avg =
      this.dataArray.reduce((a, b) => a + b, 0) /
      this.dataArray.length
    const threshold = this.options.silenceThreshold ?? 10
    const isSpeaking = avg > threshold

    const now = Date.now()

    if (isSpeaking && !this.speaking) {
      this.speaking = true
      this.silenceStart = 0
    } else if (!isSpeaking && this.speaking) {
      if (this.silenceStart === 0) {
        this.silenceStart = now
      } else if (now - this.silenceStart > 800) {
        // Silence for 800ms - transcribe
        this.speaking = false
        this.silenceStart = 0
        this.flushChunks()
      }
    }

    this.animationFrame = requestAnimationFrame(
      this.checkAudioLevel.bind(this)
    )
  }

  private flushChunks() {
    if (this.chunks.length === 0) return

    // Cooldown to avoid duplicate transcriptions
    if (this.cooldownTimer) return
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null
    }, 2000)

    const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType })
    this.chunks = []

    this.transcribe(blob)
  }

  private async transcribe(blob: Blob) {
    try {
      const formData = new FormData()
      formData.append("audio", blob, "audio.webm")

      const response = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) return

      const result = await response.json()
      const text = result.text

      if (text && text !== this.lastTranscription) {
        this.lastTranscription = text
        this.options.onTranscription(text, this.options.userId)
      }
    } catch {
      // transcription failed silently
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop()
    }
    cancelAnimationFrame(this.animationFrame)
    if (this.cooldownTimer) clearTimeout(this.cooldownTimer)
    this.audioContext?.close()
    this.mediaRecorder = null
    this.analyser = null
    this.dataArray = null
    this.audioContext = null
  }
}
