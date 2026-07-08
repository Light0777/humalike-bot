"use client"

import { useEffect, useRef, useCallback } from "react"
import { AudioCapture } from "@/lib/voice/audio-capture"
import type { AIStatus } from "@/lib/types"

interface UseAIChatOptions {
  roomId: string | null
  aiParticipantId: string | null
  aiName: string
  localStream: MediaStream | null
  aiEnabled: boolean
  onStatusChange: (status: AIStatus) => void
}

export function useAIChat({
  roomId,
  aiParticipantId,
  aiName,
  localStream,
  aiEnabled,
  onStatusChange,
}: UseAIChatOptions) {
  const captureRef = useRef<AudioCapture | null>(null)
  const respondTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTranscriptRef = useRef("")
  const isRespondingRef = useRef(false)

  const triggerAIResponse = useCallback(
    async (transcript: string, speakerId: string) => {
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

        if (!respondRes.ok) return

        const decision = await respondRes.json()

        if (!decision.should_respond) {
          onStatusChange("listening")
          isRespondingRef.current = false
          return
        }

        onStatusChange("speaking")

        // Synthesize and play response
        const ttsRes = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: decision.text }),
        })

        if (!ttsRes.ok) {
          onStatusChange("listening")
          isRespondingRef.current = false
          return
        }

        const audioBlob = await ttsRes.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          onStatusChange("listening")
          isRespondingRef.current = false
        }

        await audio.play()
      } catch {
        onStatusChange("listening")
        isRespondingRef.current = false
      }
    },
    [roomId, aiParticipantId, aiName, onStatusChange]
  )

  const handleTranscription = useCallback(
    async (text: string, userId: string) => {
      if (!roomId) return

      // Save to conversation history
      try {
        await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: roomId,
            participant_id: userId,
            participant_username: "",
            content: text,
          }),
        })
      } catch {
        // ignore save errors
      }

      // Update memory/familiarity
      try {
        await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "user_spoke",
            participant_id: aiParticipantId,
            speaker_id: userId,
            content: text,
          }),
        })
      } catch {
        // ignore memory errors
      }

      // Cancel any pending response trigger
      if (respondTimerRef.current) {
        clearTimeout(respondTimerRef.current)
      }

      // Wait for natural pause then decide if AI should respond
      respondTimerRef.current = setTimeout(() => {
        triggerAIResponse(text, userId)
      }, 1500)
    },
    [roomId, aiParticipantId, triggerAIResponse]
  )

  // Start/stop audio capture when AI is toggled
  useEffect(() => {
    if (!aiEnabled || !localStream) return

    onStatusChange("listening")

    const capture = new AudioCapture({
      stream: localStream,
      userId: "local",
      onTranscription: handleTranscription,
    })

    capture.start()
    captureRef.current = capture

    return () => {
      capture.stop()
      captureRef.current = null
      if (respondTimerRef.current) {
        clearTimeout(respondTimerRef.current)
        respondTimerRef.current = null
      }
      lastTranscriptRef.current = ""
      isRespondingRef.current = false
    }
  }, [aiEnabled, localStream, handleTranscription, onStatusChange])
}
