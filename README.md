# humalike-bot

A lightweight web-based voice chat application where multiple people can join a room and optionally invite an AI participant that behaves like another human in the conversation.

The AI listens, decides **when** to speak, **what** to say, and **who** to reply to. It builds relationships, remembers conversations, forms opinions, and references past moments — like another friend in the voice chat.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), Tailwind CSS v4, TypeScript |
| Backend | Supabase (PostgreSQL, Realtime) |
| STT | faster-whisper (Python, base model, local) |
| AI Behaviour | Humalike API |
| LLM | OpenRouter — Tencent Hy3 (free) |
| TTS | edge-tts (Python, local) |
| Voice | WebRTC (mesh network via Supabase Realtime signaling) |

---

## Architecture

```
Browser (Next.js)
  │
  ├── Voice Transport (WebRTC mesh)
  │     │
  │     ├── Speech Recognition (faster-whisper /api/stt)
  │     │
  │     ├── Conversation Engine (context window, transcript)
  │     │
  │     ├── Humalike (behaviour decider — speak/silence/tone)
  │     │
  │     ├── LLM (OpenRouter — response generation)
  │     │
  │     ├── TTS (edge-tts /api/tts)
  │     │
  │     └── Voice Output (browser audio)
  │
  └── Long-Term Memory (relationships, familiarity, memories)
```

Each layer is independent. Every AI provider is replaceable.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # Home — Create/Join room
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Design tokens
│   ├── room/[id]/page.tsx        # Room page
│   └── api/
│       ├── rooms/                # Create, lookup rooms
│       ├── participants/         # Join, leave, list
│       ├── ai/                   # Add/remove AI, respond pipeline
│       ├── conversations/        # Transcript storage
│       ├── stt/                  # STT proxy (→ faster-whisper)
│       ├── tts/                  # TTS proxy (→ edge-tts)
│       └── memory/               # Relationships, memories, familiarity
├── components/
│   ├── ui/                       # Button, Input, Card primitives
│   ├── layout/                   # Header
│   └── room/                     # RoomView, ParticipantList, VoiceControls, AIStatus
└── lib/
    ├── supabase/                 # Client, server, service
    ├── voice/                    # WebRTC, signaling, audio capture
    ├── ai/                       # Humalike, OpenRouter, useAIChat hook
    ├── conversation/             # Conversation engine
    ├── memory/                   # Memory service
    ├── types/                    # Shared TypeScript types
    └── utils/                    # Session, room code, formatting

stt-service/                      # Python faster-whisper HTTP server
tts-service/                      # Python edge-tts HTTP server
supabase/migrations/              # Database schema + RLS policies
```

---

## Setup

### 1. Environment

Copy `.env.example` to `.env` and fill in your keys:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# STT (faster-whisper)
STT_SERVICE_URL=http://localhost:8765

# TTS (edge-tts)
TTS_SERVICE_URL=http://localhost:8766

# Humalike API
HUMALIKE_API_URL=http://localhost:8080

# OpenRouter
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=tencent/hy3:free
```

### 2. Database

Run the SQL migrations in `supabase/migrations/` against your Supabase project:

```
00001_initial.sql     → Tables (rooms, participants, conversations, etc.)
00002_rls_policies.sql → Public access policies (no auth required)
```

### 3. Install dependencies

```bash
npm install
```

### 4. Python services (for STT & TTS)

```bash
# STT — faster-whisper (port 8765)
cd stt-service
pip install -r requirements.txt
python server.py

# TTS — edge-tts (port 8766)
cd tts-service
pip install -r requirements.txt
python server.py
```

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000

---

## Usage

1. Enter a username on the home page
2. **Create Room** to start a new voice room (share the 6-character code)
3. Or **Join Room** with a friend's code
4. Click **Add AI** to invite the AI participant
5. Speak naturally — the AI will listen and respond like another person

The AI status indicator shows: `idle` → `listening` → `thinking` → `speaking`

---

## AI Behaviour

The AI is designed to feel like another human in the room:

- **Stays silent** most of the time — silence is a feature
- **Listens** to the conversation
- **Decides** whether to speak (via Humalike API, or default fallback)
- **Responds** naturally using OpenRouter LLM
- **Builds relationships** — familiarity increases the more someone speaks
- **Remembers** — notable moments and past conversations are stored
- **Forms opinions** — stored as relationship data
- **References jokes** — inside jokes and callbacks improve over time

When Humalike API is unavailable, the AI uses a default decision that responds naturally ~30% of the time.

---

## Phases

| Phase | Feature |
|-------|---------|
| 1 | Project setup — Next.js, Tailwind, Supabase, types |
| 2 | Room system — Create, Join, Leave, codes |
| 3 | Voice system — WebRTC mesh, mic, speaker |
| 4 | AI Participant — Add/Remove AI |
| 5 | Speech Recognition — faster-whisper integration |
| 6 | Conversation Engine — transcript, context window |
| 7 | Humalike Integration — behaviour decisions |
| 8 | Response Generation — OpenRouter LLM |
| 9 | Speech Synthesis — edge-tts |
| 10 | Long-Term Memory — relationships, memories |

---

## Design

The UI follows a Vercel-inspired design system (see `DESIGN.md`):

- **Canvas**: `#ffffff` / `#fafafa`
- **Ink**: `#171717`
- **Body**: `#4d4d4d`
- **Mute**: `#888888`
- **Hairline**: `#ebebeb`
- **Error**: `#ee0000`
- Pill-shaped buttons, subtle stacked shadows, monospace for technical labels

---

## License

MIT
