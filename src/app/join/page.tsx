"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"

function JoinForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialUsername = searchParams.get("username") || ""

  const [username, setUsername] = useState(initialUsername)
  const [roomCode, setRoomCode] = useState("")
  const [error, setError] = useState("")

  const handleJoin = () => {
    if (!username.trim()) {
      setError("Enter a username")
      return
    }
    if (!roomCode.trim()) {
      setError("Enter a room code")
      return
    }
    setError("")
    router.push(
      `/room/${roomCode.trim().toUpperCase()}?username=${encodeURIComponent(username.trim())}`
    )
  }

  return (
    <Card variant="soft" className="w-full max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[#171717]">
          Join a room
        </h1>
        <p className="text-sm text-[#888]">
          Enter the room code shared with you.
        </p>
      </div>

      <div className="space-y-4">
        <Input
          id="username"
          label="Username"
          placeholder="Your name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={20}
        />

        <Input
          id="roomCode"
          label="Room Code"
          placeholder="e.g. ABC123"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          maxLength={6}
        />

        <Button className="w-full" onClick={handleJoin}>
          Join Room
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-[#888]"
          onClick={() => router.push("/")}
        >
          Back
        </Button>
      </div>

      {error && (
        <p className="text-sm text-[#ee0000] text-center">{error}</p>
      )}
    </Card>
  )
}

export default function JoinPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Suspense fallback={null}>
        <JoinForm />
      </Suspense>
    </div>
  )
}
