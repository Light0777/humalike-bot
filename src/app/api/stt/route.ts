import { NextRequest, NextResponse } from "next/server"

const STT_SERVICE_URL =
  process.env.STT_SERVICE_URL || "http://localhost:8765"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audio = formData.get("audio")

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json(
        { error: "Audio blob is required" },
        { status: 400 }
      )
    }

    const audioBuffer = await audio.arrayBuffer()

    const sttForm = new FormData()
    sttForm.append(
      "audio",
      new Blob([audioBuffer], { type: "audio/wav" }),
      "audio.wav"
    )

    const response = await fetch(`${STT_SERVICE_URL}/transcribe`, {
      method: "POST",
      body: sttForm,
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("STT service error:", error)
      return NextResponse.json(
        { error: "Transcription failed" },
        { status: 502 }
      )
    }

    const result = await response.json()
    return NextResponse.json(result)
  } catch (error) {
    console.error("STT proxy error:", error)
    return NextResponse.json(
      { error: "Transcription service unavailable" },
      { status: 503 }
    )
  }
}
