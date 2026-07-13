"use client"

import type { AIChatDebug } from "@/lib/ai/useAIChat"

interface AIDebugProps {
  debug: AIChatDebug | null
}

export function AIDebug({ debug }: AIDebugProps) {
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
    </div>
  )
}
