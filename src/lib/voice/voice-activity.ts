export interface VADEvent {
  speaking: boolean
  level: number
}

export type VADCallback = (event: VADEvent) => void

export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null
  private animationFrame: number = 0
  private running = false
  private threshold: number
  private silenceHeldMs: number
  private speaking = false
  private silenceStart = 0

  onVAD: VADCallback | null = null

  constructor(threshold = 10, silenceHeldMs = 400) {
    this.threshold = threshold
    this.silenceHeldMs = silenceHeldMs
  }

  start(stream: MediaStream) {
    if (this.running) return
    this.running = true

    this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)

    this.speaking = false
    this.silenceStart = 0
    this.poll()
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.animationFrame)
    this.audioContext?.close()
    this.audioContext = null
    this.analyser = null
    this.dataArray = null
  }

  private poll = () => {
    if (!this.running) return
    if (!this.analyser || !this.dataArray) return

    this.analyser.getByteFrequencyData(this.dataArray)
    const avg =
      this.dataArray.reduce((a, b) => a + b, 0) /
      this.dataArray.length
    const isSpeaking = avg > this.threshold
    const level = Math.min(1, avg / 128)

    const now = Date.now()

    if (isSpeaking && !this.speaking) {
      this.speaking = true
      this.silenceStart = 0
      this.onVAD?.({ speaking: true, level })
    } else if (!isSpeaking && this.speaking) {
      if (this.silenceStart === 0) {
        this.silenceStart = now
      } else if (now - this.silenceStart > this.silenceHeldMs) {
        this.speaking = false
        this.silenceStart = 0
        this.onVAD?.({ speaking: false, level })
      }
    }

    this.animationFrame = requestAnimationFrame(this.poll)
  }
}
