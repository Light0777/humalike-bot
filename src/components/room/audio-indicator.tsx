"use client"

import { useMemo } from "react"

interface AudioIndicatorProps {
  audioLevel: number
  speaking: boolean
  size?: "sm" | "md"
}

export function AudioIndicator({
  audioLevel,
  speaking,
  size = "sm",
}: AudioIndicatorProps) {
  const bars = useMemo(() => {
    const count = size === "sm" ? 4 : 6
    return Array.from({ length: count }, (_, i) => {
      const threshold = (i + 1) / count
      return audioLevel > threshold
    })
  }, [audioLevel, size])

  return (
    <div className="flex items-end gap-0.5 h-4">
      {bars.map((active, i) => (
        <div
          key={i}
          className={`w-0.5 rounded-full transition-all duration-75 ${
            active && speaking
              ? "bg-green-500"
              : "bg-[#ebebeb]"
          }`}
          style={{
            height: active && speaking ? `${40 + i * 20}%` : "20%",
          }}
        />
      ))}
    </div>
  )
}
