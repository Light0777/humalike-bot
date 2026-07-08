import type { Participant } from "@/lib/types"

interface ParticipantListProps {
  participants: Participant[]
  aiEnabled: boolean
  aiStatus?: string
}

export function ParticipantList({
  participants,
  aiEnabled,
  aiStatus,
}: ParticipantListProps) {
  return (
    <div className="flex flex-col gap-2">
      {participants.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-3 px-4 py-2.5 rounded-md bg-[#fafafa] text-sm text-[#4d4d4d]"
        >
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>{p.username}</span>
          {p.is_ai && (
            <span className="ml-auto text-xs font-mono text-[#888] uppercase">
              {aiStatus || "idle"}
            </span>
          )}
        </div>
      ))}
      {aiEnabled && !participants.some((p) => p.is_ai) && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-md bg-[#fafafa] text-sm text-[#4d4d4d] opacity-60">
          <div className="w-2 h-2 rounded-full bg-gray-300" />
          <span>AI joining...</span>
        </div>
      )}
    </div>
  )
}
