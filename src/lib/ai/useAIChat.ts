"use client"

import { useEffect, useRef, useCallback, useDebugValue } from "react"
import type { AIStatus } from "@/lib/types"

export interface AIChatDebug {
  sttAvailable: boolean
  transcripts: string[]
  lastTranscript: string
  lastDecision: string
  lastError: string
  responseCount: number
}

interface UseAIChatOptions {
  roomId: string | null
  localParticipantId: string | null
  aiParticipantId: string | null
  aiName: string
  aiEnabled: boolean
  onStatusChange: (status: AIStatus) => void
  onDebug?: (debug: AIChatDebug) => void
}

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

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? window.webkitSpeechRecognition
    : undefined

async function speakResponse(text: string): Promise<void> {
  if ("speechSynthesis" in window) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.1
      utterance.pitch = 1.0
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      speechSynthesis.speak(utterance)
    })
  }

  try {
    const ttsRes = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (!ttsRes.ok) return
    const audioBlob = await ttsRes.blob()
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    await new Promise<void>((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        resolve()
      }
      audio.play()
    })
  } catch {
    // TTS unavailable
  }
}

export function useAIChat({
  roomId,
  localParticipantId,
  aiParticipantId,
  aiName,
  aiEnabled,
  onStatusChange,
  onDebug,
}: UseAIChatOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const respondTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTranscriptRef = useRef("")
  const isRespondingRef = useRef(false)
  const isRunningRef = useRef(false)
  const aiEnabledRef = useRef(aiEnabled)
  const cleanupRef = useRef(false)

  const debugRef = useRef<AIChatDebug>({
    sttAvailable: !!SpeechRecognitionAPI,
    transcripts: [],
    lastTranscript: "",
    lastDecision: "",
    lastError: "",
    responseCount: 0,
  })

  const emitDebug = useCallback(
    (partial: Partial<AIChatDebug>) => {
      const next = { ...debugRef.current, ...partial }
      debugRef.current = next
      onDebug?.(next)
    },
    [onDebug]
  )

  const triggerAIResponse = useCallback(
    async (transcript: string) => {
      if (!roomId || !aiParticipantId || isRespondingRef.current) return
      if (lastTranscriptRef.current === transcript) return
      lastTranscriptRef.current = transcript

      isRespondingRef.current = true
      onStatusChange("thinking")

      try {
        const respondRes = await fetch("/api/ai/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: roomId,
            ai_participant_id: aiParticipantId,
            ai_name: aiName,
          }),
        })

        if (!respondRes.ok) {
          const errText = await respondRes.text()
          emitDebug({ lastError: `AI respond ${respondRes.status}: ${errText}` })
          onStatusChange("listening")
          isRespondingRef.current = false
          return
        }

        const decision = await respondRes.json()

        emitDebug({
          lastDecision: decision.should_respond
            ? `Speaking: "${decision.text?.slice(0, 80)}..."`
            : `Silent: ${decision.reason || "no reason"}`,
          responseCount:
            debugRef.current.responseCount + (decision.should_respond ? 1 : 0),
          lastError: decision.llmError || debugRef.current.lastError,
        })

        if (!decision.should_respond) {
          onStatusChange("listening")
          isRespondingRef.current = false
          return
        }

        onStatusChange("speaking")
        await speakResponse(decision.text)
        onStatusChange("listening")
        isRespondingRef.current = false
      } catch (e) {
        emitDebug({ lastError: `AI pipeline error: ${e}` })
        onStatusChange("listening")
        isRespondingRef.current = false
      }
    },
    [roomId, aiParticipantId, aiName, onStatusChange, emitDebug]
  )

  const handleTranscript = useCallback(
    async (text: string) => {
      if (!roomId || !aiParticipantId) return

      const trimmed = text.trim()
      if (!trimmed || trimmed.length < 3) return

      emitDebug({
        transcripts: [...debugRef.current.transcripts.slice(-9), trimmed],
        lastTranscript: trimmed,
      })

      Promise.all([
        fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: roomId,
            participant_id: localParticipantId || aiParticipantId,
            participant_username: "",
            content: trimmed,
          }),
        }).catch(() => {}),
        fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "user_spoke",
            participant_id: localParticipantId || aiParticipantId,
            speaker_id: localParticipantId || aiParticipantId,
            content: trimmed,
          }),
        }).catch(() => {}),
      ])

      if (respondTimerRef.current) {
        clearTimeout(respondTimerRef.current)
      }

      respondTimerRef.current = setTimeout(() => {
        triggerAIResponse(trimmed)
      }, 300)
    },
    [roomId, aiParticipantId, triggerAIResponse, emitDebug]
  )

  // Sync ref so onend can check current value
  aiEnabledRef.current = aiEnabled

  const simulateTranscript = useCallback(
    (text: string) => {
      if (!roomId || !aiParticipantId) {
        emitDebug({ lastError: "simulateTranscript: room or AI not ready yet" })
        return
      }
      handleTranscript(text)
    },
    [roomId, aiParticipantId, handleTranscript, emitDebug]
  )

  // Start/stop recognition based on aiEnabled
  useEffect(() => {
    cleanupRef.current = false

    // Stop any running recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    if (respondTimerRef.current) {
      clearTimeout(respondTimerRef.current)
      respondTimerRef.current = null
    }
    isRunningRef.current = false
    isRespondingRef.current = false

    if (!aiEnabledRef.current || !SpeechRecognitionAPI) {
      onStatusChange(aiEnabledRef.current ? "listening" : "idle")
      return
    }

    // Start new recognition
    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = "en-US"

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results.length - 1
      if (event.results[last].isFinal) {
        const text = event.results[last][0].transcript
        handleTranscript(text)
      }
    }

    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        emitDebug({ lastError: `STT error: ${event.error}` })
      }
      if (event.error === "not-allowed") {
        emitDebug({ lastError: "Microphone access denied" })
        return
      }
    }

    const startRecognition = () => {
      if (cleanupRef.current) return
      const r = new SpeechRecognitionAPI()
      r.continuous = true
      r.interimResults = false
      r.lang = "en-US"
      r.onresult = recognition.onresult
      r.onerror = recognition.onerror
      r.onend = recognition.onend
      try {
        r.start()
        recognitionRef.current = r
        isRunningRef.current = true
        onStatusChange("listening")
        emitDebug({ lastError: "" })
      } catch (e) {
        emitDebug({ lastError: `STT start failed: ${e}` })
        onStatusChange("idle")
      }
    }

    recognition.onend = () => {
      isRunningRef.current = false
      recognitionRef.current = null
      if (aiEnabledRef.current && !cleanupRef.current) {
        restartTimerRef.current = setTimeout(startRecognition, 100)
      }
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      isRunningRef.current = true
      onStatusChange("listening")
      emitDebug({ lastError: "" })
    } catch (e) {
      emitDebug({ lastError: `STT start failed: ${e}` })
      onStatusChange("idle")
    }

    return () => {
      cleanupRef.current = true
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current)
        restartTimerRef.current = null
      }
      if (respondTimerRef.current) {
        clearTimeout(respondTimerRef.current)
        respondTimerRef.current = null
      }
      isRunningRef.current = false
      isRespondingRef.current = false
    }
  }, [aiEnabled, handleTranscript, emitDebug, onStatusChange])

  return { simulateTranscript }
}
