"use client"

import type { VoiceState } from "@/lib/voice/types"

interface VoiceControlsProps {
  voiceState: VoiceState
  onToggleMic: () => void
  onToggleSpeaker: () => void
}

export function VoiceControls({
  voiceState,
  onToggleMic,
  onToggleSpeaker,
}: VoiceControlsProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onToggleMic}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          voiceState.micEnabled
            ? "bg-[#f5f5f5] text-[#171717] hover:bg-[#ebebeb]"
            : "bg-[#f7d4d6] text-[#ee0000]"
        }`}
        title={voiceState.micEnabled ? "Mute microphone" : "Unmute microphone"}
      >
        <span className="text-sm">
          {voiceState.micEnabled ? "🎤" : "🔇"}
        </span>
        {voiceState.micEnabled ? "Mic On" : "Mic Off"}
      </button>

      <button
        onClick={onToggleSpeaker}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          voiceState.speakerEnabled
            ? "bg-[#f5f5f5] text-[#171717] hover:bg-[#ebebeb]"
            : "bg-[#ffefcf] text-[#ab570a]"
        }`}
        title={
          voiceState.speakerEnabled ? "Mute speakers" : "Unmute speakers"
        }
      >
        <span className="text-sm">
          {voiceState.speakerEnabled ? "🔊" : "🔇"}
        </span>
        {voiceState.speakerEnabled ? "Speaker On" : "Speaker Off"}
      </button>

      {voiceState.speaking && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Speaking
        </div>
      )}
    </div>
  )
}
