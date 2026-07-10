"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"

export default function HomePage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [error, setError] = useState("")

  const handleCreate = () => {
    if (!username.trim()) {
      setError("Enter a username")
      return
    }
    setError("")
    router.push(`/room/new?username=${encodeURIComponent(username.trim())}`)
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card variant="soft" className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[#171717]">
            Join a voice room
          </h1>
          <p className="text-sm text-[#888]">
            No sign-up required. Pick a name and go.
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

          <Button className="w-full" onClick={handleCreate}>
            Create Room
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#ebebeb]" />
            </div>
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => router.push("/join")}
          >
            Join Room
          </Button>
        </div>

        {error && (
          <p className="text-sm text-[#ee0000] text-center">{error}</p>
        )}
      </Card>
    </div>
  )
}
