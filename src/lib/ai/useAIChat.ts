"use client"

import { useEffect, useRef, useCallback } from "react"
import type { AIStatus } from "@/lib/types"
import { VoicePipeline } from "@/lib/voice/pipeline"
import type { TranscriptUpdate } from "@/lib/voice/streaming-stt"

export interface AIChatDebug {
  sttAvailable: boolean
  transcripts: string[]
  lastTranscript: string
  lastDecision: string
  lastError: string
  responseCount: number
  partialTranscript: string
}

interface UseAIChatOptions {
  roomId: string | null
  localParticipantId: string | null
  aiParticipantId: string | null
  aiName: string
  username: string
  aiEnabled: boolean
  onStatusChange: (status: AIStatus) => void
  onDebug?: (debug: AIChatDebug) => void
  onTranscript?: (text: string, isFinal: boolean) => void
}

declare global {
  interface Window {
    voicePipeline: VoicePipeline | undefined
  }
}

export function useAIChat({
  roomId,
  localParticipantId,
  aiParticipantId,
  aiName,
  username,
  aiEnabled,
  onStatusChange,
  onDebug,
  onTranscript,
}: UseAIChatOptions) {
  const pipelineRef = useRef<VoicePipeline | null>(null)
  const userIdRef = useRef(localParticipantId || "")
  const isPipelineReady = useRef(false)

  const debugRef = useRef<AIChatDebug>({
    sttAvailable: typeof window !== "undefined" && !!(
      (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    ),
    transcripts: [],
    lastTranscript: "",
    lastDecision: "",
    lastError: "",
    responseCount: 0,
    partialTranscript: "",
  })

  const emitDebug = useCallback(
    (partial: Partial<AIChatDebug>) => {
      const next = { ...debugRef.current, ...partial }
      debugRef.current = next
      onDebug?.(next)
    },
    [onDebug]
  )

  // Keep callback refs up-to-date so pipeline always calls the latest version
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript
  const emitDebugRef = useRef(emitDebug)
  emitDebugRef.current = emitDebug

  // Initialize pipeline once when we have room context
  useEffect(() => {
    if (!roomId || !aiParticipantId || !localParticipantId) return
    if (isPipelineReady.current) return
    if (pipelineRef.current) return

    const pipeline = new VoicePipeline(localParticipantId, username, {
      onStatusChange: (status) => {
        onStatusChangeRef.current(status as AIStatus)
      },
      onTranscriptUpdate: (update: TranscriptUpdate) => {
        onTranscriptRef.current?.(update.text, update.isFinal)
        if (update.isFinal) {
          emitDebugRef.current({
            transcripts: [
              ...debugRef.current.transcripts.slice(-9),
              update.text,
            ],
            lastTranscript: update.text,
            partialTranscript: "",
          })
        } else {
          emitDebugRef.current({ partialTranscript: update.text })
        }
      },
      onDebug: (msg: string) => {
        emitDebugRef.current({
          lastDecision: msg,
          responseCount:
            debugRef.current.responseCount +
            (msg.startsWith("Speaking:") ? 1 : 0),
        })
      },
    })

    pipeline.setRoomContext(roomId, aiParticipantId, aiName)
    pipelineRef.current = pipeline
    window.voicePipeline = pipeline
    isPipelineReady.current = true

    // Auto-start if AI is already enabled when pipeline is created
    if (aiEnabled) {
      pipeline.start()
    }

    return () => {
      pipeline.stop()
      pipelineRef.current = null
      window.voicePipeline = undefined
      isPipelineReady.current = false
    }
  }, [roomId, aiParticipantId, localParticipantId, aiName, aiEnabled])

  const simulateTranscript = useCallback(
    (text: string) => {
      if (!roomId || !aiParticipantId) {
        emitDebug({ lastError: "simulateTranscript: room or AI not ready yet" })
        return
      }

      if (pipelineRef.current) {
        pipelineRef.current.simulateTranscript(text)
      }
    },
    [roomId, aiParticipantId, emitDebug]
  )

  const injectRemoteTranscript = useCallback(
    (userId: string, username: string, text: string, isFinal: boolean) => {
      if (pipelineRef.current) {
        pipelineRef.current.injectRemoteTranscript(userId, username, text, isFinal)
      }
    },
    []
  )

  return { simulateTranscript, injectRemoteTranscript }
}
