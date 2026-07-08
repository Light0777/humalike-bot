import type { AIStatus as AIStatusType } from "@/lib/types"

interface AIStatusProps {
  status: AIStatusType
}

const statusConfig = {
  idle: { label: "Idle", dot: "bg-gray-300" },
  listening: { label: "Listening", dot: "bg-green-500" },
  thinking: { label: "Thinking", dot: "bg-yellow-500" },
  speaking: { label: "Speaking", dot: "bg-blue-500" },
}

export function AIStatus({ status }: AIStatusProps) {
  const config = statusConfig[status]
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${config.dot} animate-pulse`} />
      <span className="text-xs font-mono text-[#888] uppercase">
        {config.label}
      </span>
    </div>
  )
}
