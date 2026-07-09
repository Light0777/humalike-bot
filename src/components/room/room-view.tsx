"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ParticipantList } from "@/components/room/participant-list"
import { AIStatus } from "@/components/room/ai-status"
import { VoiceControls } from "@/components/room/voice-controls"
import { AudioIndicator } from "@/components/room/audio-indicator"
import { useVoiceRoom } from "@/lib/voice/useVoiceRoom"
import { useAIChat, type AIChatDebug } from "@/lib/ai/useAIChat"
import { AIDebug } from "@/components/room/ai-debug"
import { getUserId, storeUsername } from "@/lib/utils/session"
import type { Participant, AIStatus as AIStatusType } from "@/lib/types"

interface RoomViewProps {
  roomId: string
  username: string
}

export function RoomView({ roomId, username }: RoomViewProps) {
  const router = useRouter()
  const isNewRoom = roomId === "new"

  const [roomCode, setRoomCode] = useState(isNewRoom ? "" : roomId)
  const [backendRoomId, setBackendRoomId] = useState("")
  const [participants, setParticipants] = useState<Participant[]>([])
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiStatus, setAiStatus] = useState<AIStatusType>("idle")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDebug, setAiDebug] = useState<AIChatDebug | null>(null)
  const [connected, setConnected] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const userId = getUserId()

  const { peers, voiceState, toggleMic, toggleSpeaker } = useVoiceRoom(
    roomCode || "loading",
    userId,
    username
  )

  const aiParticipant = participants.find((p) => p.is_ai) ?? null

  useAIChat({
    roomId: backendRoomId || null,
    aiParticipantId: aiParticipant?.id ?? null,
    aiName: "AI",
    aiEnabled,
    onStatusChange: setAiStatus,
    onDebug: setAiDebug,
  })

  useEffect(() => {
    storeUsername(username)
  }, [username])

  const fetchRoom = useCallback(async (code: string) => {
    const res = await fetch(`/api/rooms/${code}`)
    if (!res.ok) {
      setError("Room not found")
      setConnected(false)
      return null
    }
    return res.json()
  }, [])

  const createRoom = useCallback(async () => {
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${username}'s Room` }),
    })
    if (!res.ok) throw new Error("Failed to create room")
    const room = await res.json()
    setRoomCode(room.code)
    return room
  }, [username])

  const joinRoom = useCallback(
    async (roomId: string) => {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId,
          user_id: userId,
          username,
        }),
      })
      if (!res.ok) throw new Error("Failed to join room")
      return res.json()
    },
    [userId, username]
  )

  const loadParticipants = useCallback(async (roomId: string) => {
    const res = await fetch(`/api/participants?room_id=${roomId}`)
    if (!res.ok) throw new Error("Failed to load participants")
    const data = await res.json()
    setParticipants(data)

    const ai = data.find(
      (p: Participant) => p.is_ai
    )
    if (ai) {
      setAiEnabled(true)
      setAiStatus("listening")
    } else {
      setAiEnabled(false)
      setAiStatus("idle")
    }
  }, [])

  const initialize = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      if (isNewRoom) {
        const room = await createRoom()
        if (room) {
          setBackendRoomId(room.id)
          await joinRoom(room.id)
          await loadParticipants(room.id)
        }
      } else {
        const room = await fetchRoom(roomId)
        if (room) {
          setBackendRoomId(room.id)
          await joinRoom(room.id)
          await loadParticipants(room.id)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [isNewRoom, roomId, createRoom, joinRoom, loadParticipants, fetchRoom])

  useEffect(() => {
    initialize()
  }, [initialize])

  const handleToggleAI = async () => {
    if (!backendRoomId) return
    setAiLoading(true)
    try {
      if (aiEnabled) {
        await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: backendRoomId,
            action: "remove",
          }),
        })
        setAiEnabled(false)
        setAiStatus("idle")
      } else {
        await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: backendRoomId,
            action: "add",
          }),
        })
        setAiEnabled(true)
        setAiStatus("listening")
      }
      await loadParticipants(backendRoomId)
    } catch {
      // revert optimistic state on error
      setAiEnabled((prev) => !prev)
    } finally {
      setAiLoading(false)
    }
  }

  const handleLeave = () => {
    router.push("/")
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#888]">
          <div className="w-2 h-2 rounded-full bg-[#888] animate-pulse" />
          <span className="text-sm font-mono uppercase">
            {isNewRoom ? "Creating room..." : "Joining room..."}
          </span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Card className="text-center space-y-4 max-w-sm">
          <p className="text-sm text-[#ee0000]">{error}</p>
          <Button variant="secondary" onClick={() => router.push("/")}>
            Go Home
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-6 max-w-2xl mx-auto w-full gap-6">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold tracking-tight text-[#171717]">
            {isNewRoom ? "Your Room" : "Room"}
          </h1>
          <p className="font-mono text-sm text-[#888]">{roomCode}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-xs text-[#888]">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLeave}>
            Leave
          </Button>
        </div>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[#4d4d4d]">
            Participants ({participants.length})
          </h2>
          <Button
            variant={aiEnabled ? "secondary" : "primary"}
            size="sm"
            onClick={handleToggleAI}
            disabled={aiLoading}
          >
            {aiLoading
              ? "..."
              : aiEnabled
                ? "Remove AI"
                : "Add AI"}
          </Button>
        </div>
        <ParticipantList
          participants={participants}
          aiEnabled={aiEnabled}
          aiStatus={aiStatus}
        />
      </Card>

      <Card variant="elevated" className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#4d4d4d]">Voice</span>
          <div className="flex items-center gap-4">
            <AudioIndicator
              audioLevel={voiceState.audioLevel}
              speaking={voiceState.speaking}
              size="sm"
            />
            <VoiceControls
              voiceState={voiceState}
              onToggleMic={toggleMic}
              onToggleSpeaker={toggleSpeaker}
            />
          </div>
        </div>

        {peers.length > 0 && (
          <div className="border-t border-[#ebebeb] pt-3 space-y-1">
            <span className="text-xs text-[#888] font-mono uppercase">
              Connected Peers
            </span>
            {peers.map((peer) => (
              <div
                key={peer.userId}
                className="flex items-center justify-between text-sm text-[#4d4d4d]"
              >
                <span>{peer.username}</span>
                <span
                  className={`text-xs ${
                    peer.connected ? "text-green-500" : "text-[#888]"
                  }`}
                >
                  {peer.connected ? "connected" : "connecting..."}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {aiEnabled && (
        <Card variant="soft" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#171717]" />
              <span className="text-sm text-[#4d4d4d]">AI Participant</span>
            </div>
            <AIStatus status={aiStatus} />
          </div>
          {aiDebug && <AIDebug debug={aiDebug} />}
        </Card>
      )}

      <div className="text-center text-xs text-[#888] mt-auto">
        {isNewRoom
          ? "Share the room code with friends to let them join."
          : `Connected to room ${roomCode}`}
      </div>
    </div>
  )
}
