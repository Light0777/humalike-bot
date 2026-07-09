"use client"

import { useState, useEffect } from "react"
import type { AIChatDebug } from "@/lib/ai/useAIChat"

interface AIDebugProps {
  debug: AIChatDebug | null
  onSimulate?: (text: string) => void
}

export function AIDebug({ debug, onSimulate }: AIDebugProps) {
  const [input, setInput] = useState("")

  // TEMP: expose simulation to browser console
  useEffect(() => {
    if (onSimulate) {
      ;(window as any).simulateSTT = onSimulate
    }
    return () => {
      delete (window as any).simulateSTT
    }
  }, [onSimulate])

  if (!debug) return null

  return (
    <div className="border-t border-[#ebebeb] pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#888] uppercase">
          AI Debug
        </span>
        <span
          className={`text-xs font-mono ${
            debug.sttAvailable ? "text-green-500" : "text-red-500"
          }`}
        >
          STT: {debug.sttAvailable ? "available" : "unavailable"}
        </span>
      </div>

      {debug.lastTranscript && (
        <div className="text-xs text-[#4d4d4d]">
          <span className="text-[#888]">Heard: </span>
          {debug.lastTranscript}
        </div>
      )}

      {debug.lastDecision && (
        <div className="text-xs text-[#4d4d4d]">
          <span className="text-[#888]">AI: </span>
          {debug.lastDecision}
        </div>
      )}

      {debug.lastError && (
        <div className="text-xs text-red-500 break-words">
          <span className="text-red-400">Error: </span>
          {debug.lastError}
        </div>
      )}

      {debug.transcripts.length > 1 && (
        <div className="text-xs text-[#888]">
          <span className="text-[#888]">History: </span>
          {debug.transcripts.slice(-3).join(" | ")}
        </div>
      )}

      <div className="text-xs font-mono text-[#888]">
        Responses: {debug.responseCount}
      </div>

      {/* TEMP: STT simulator — remove before production */}
      {onSimulate && (
        <div className="border-t border-[#ebebeb] pt-2 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                onSimulate(input.trim())
                setInput("")
              }
            }}
            placeholder="Simulate speech..."
            className="flex-1 text-xs px-2 py-1 border border-[#ebebeb] rounded bg-transparent text-[#4d4d4d] outline-none focus:border-[#888]"
          />
          <button
            onClick={() => {
              if (input.trim()) {
                onSimulate(input.trim())
                setInput("")
              }
            }}
            className="text-xs px-2 py-1 rounded bg-[#171717] text-white"
          >
            Send
          </button>
        </div>
      )}
      {/* TEMP end */}
    </div>
  )
}
