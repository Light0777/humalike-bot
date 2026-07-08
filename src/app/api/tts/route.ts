import { NextRequest, NextResponse } from "next/server"

const TTS_SERVICE_URL =
  process.env.TTS_SERVICE_URL || "http://localhost:8766"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, voice, rate, pitch } = body

    if (!text) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      )
    }

    const response = await fetch(`${TTS_SERVICE_URL}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: voice || "en-US-JennyNeural",
        rate: rate || "+0%",
        pitch: pitch || "+0Hz",
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("TTS service error:", error)
      return NextResponse.json(
        { error: "Speech synthesis failed" },
        { status: 502 }
      )
    }

    const audioBuffer = await response.arrayBuffer()

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="speech.mp3"',
      },
    })
  } catch (error) {
    console.error("TTS proxy error:", error)
    return NextResponse.json(
      { error: "TTS service unavailable" },
      { status: 503 }
    )
  }
}
