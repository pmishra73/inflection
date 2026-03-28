# Architecture

## Overview

Inflection is a full-stack web application split into two independently runnable services:

- **Backend** — Python FastAPI server handling auth, data persistence, AI orchestration, and WebSocket streaming
- **Frontend** — Next.js 14 web app providing the recording UI, live display, and session reports

Both services communicate over HTTP (REST) and WebSockets. The frontend can be deployed as a static/SSR app, while the backend runs as an async Python process.

---

## High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│                                                             │
│  ┌──────────────┐   ┌───────────────┐   ┌───────────────┐  │
│  │  Auth Pages  │   │   Dashboard   │   │  Live Session │  │
│  │  (login /    │   │  (sessions,   │   │  (recording + │  │
│  │  register)   │   │   charts)     │   │  live display)│  │
│  └──────┬───────┘   └───────┬───────┘   └───────┬───────┘  │
│         │                  │                    │           │
│         └──────────── REST (HTTP) ──────────────┘           │
│                                                             │
│                    ┌────────────────────┐                   │
│                    │   Session Report   │                   │
│                    │  (insights, charts,│                   │
│                    │   transcript)      │                   │
│                    └────────────────────┘                   │
│                                                             │
│         Microphone → MediaRecorder → WebSocket ─────────┐  │
└─────────────────────────────────────────────────────────│──┘
                                                          │
                              ┌───────────────────────────▼──┐
                              │        FASTAPI BACKEND        │
                              │                               │
                              │  ┌─────────────────────────┐ │
                              │  │  WebSocket Handler       │ │
                              │  │  /ws/session/{id}        │ │
                              │  └───────────┬─────────────┘ │
                              │              │                │
                              │   ┌──────────▼────────────┐  │
                              │   │    Pipeline Service    │  │
                              │   │  (per audio chunk)     │  │
                              │   └──┬──────────────────┬──┘  │
                              │      │                  │     │
                              │  ┌───▼────┐        ┌────▼───┐ │
                              │  │Deepgram│        │Hume AI │ │
                              │  │Service │        │Service │ │
                              │  └───┬────┘        └────┬───┘ │
                              │      │                  │     │
                              │      └────────┬─────────┘     │
                              │               │               │
                              │   ┌───────────▼────────────┐  │
                              │   │  Combined chunk result  │  │
                              │   │  → sent to browser WS  │  │
                              │   └────────────────────────┘  │
                              │                               │
                              │  On session END:              │
                              │  ┌──────────────────────────┐ │
                              │  │  ElevenLabs Scribe       │ │
                              │  │  (full audio → HQ text)  │ │
                              │  └──────────┬───────────────┘ │
                              │             │                  │
                              │  ┌──────────▼───────────────┐ │
                              │  │  Claude Opus 4.6         │ │
                              │  │  (insights, EQ report,   │ │
                              │  │   action items, etc.)    │ │
                              │  └──────────────────────────┘ │
                              │                               │
                              │  ┌──────────────────────────┐ │
                              │  │  SQLite / PostgreSQL     │ │
                              │  │  (users, sessions,       │ │
                              │  │   chunks, results)       │ │
                              │  └──────────────────────────┘ │
                              └───────────────────────────────┘
```

---

## Data Flow — Live Session (Step by Step)

```
Step 1: User clicks "Start Recording"
        → Browser requests microphone permission
        → WebSocket connects to /ws/session/{session_id}?token={jwt}
        → Backend authenticates token, verifies session ownership

Step 2: Recording begins
        → MediaRecorder captures audio in chunks (every 5 seconds)
        → Each chunk (binary Blob) is sent over WebSocket as binary data

Step 3: Per-chunk processing (runs in parallel)
        ┌─ Deepgram REST API
        │   Input:  audio bytes (webm/opus)
        │   Output: transcript text, utterances, speaker IDs, word timestamps, sentiment
        │
        └─ Hume AI Batch API
            Input:  audio bytes
            Output: 48+ emotion scores per utterance (Joy, Anger, Anxiety, etc.)
                    + aggregated valence (-1 to +1) and arousal (0 to 1)

Step 4: Combined result sent back to browser (WebSocket JSON)
        {
          type: "chunk_result",
          transcript: "...",
          segments: [{speaker, text, start, end}],
          emotion: {dominant, top_emotions, valence, arousal}
        }

Step 5: Frontend updates in real-time
        → Transcript appended to live feed
        → Emotion display animates to new values
        → Emotion timeline log updated

Step 6: User clicks "Stop & Analyze"
        → Audio recorder stops
        → Browser sends {"type": "end"} over WebSocket
        → All buffered audio concatenated

Step 7: Post-session processing
        → ElevenLabs Scribe: full audio re-transcribed at high quality
          (word-level timestamps, accurate speaker diarization)
        → Claude Opus 4.6: generates full insight report
          (summary, action items, EQ report, incongruence analysis, etc.)
        → Session record updated in database

Step 8: Browser redirected to /session/{id}
        → Full report displayed with charts, insights, action items
```

---

## Data Flow — Session Report (REST)

```
GET /api/v1/sessions/{id}
  → JWT verified
  → Session loaded from DB
  → JSON response with all fields:
      transcript_segments, emotion_timeline, emotion_summary, insights
  → Frontend renders charts (Recharts), emotion display, structured sections
```

---

## Authentication Flow

```
Register / Login
  → POST /api/v1/auth/register  or  /api/v1/auth/login
  → Backend validates credentials, returns JWT (HS256, 7-day expiry)
  → Token stored in localStorage

All protected requests:
  → Authorization: Bearer {token} header
  → Backend decodes token → extracts user_id → loads User from DB

WebSocket auth:
  → Token passed as query param: /ws/session/{id}?token={jwt}
  → Backend decodes token before accepting connection
```

---

## Emotion Analysis — Two Signals

Inflection combines two independent emotion signals for maximum accuracy:

| Signal | Source | What it measures |
|--------|--------|-----------------|
| **Voice Emotion** | Hume AI (audio) | Pitch, energy, tempo, timbre → 48+ emotion labels |
| **Text Sentiment** | Deepgram (transcript) | Positive / Neutral / Negative per utterance |
| **Incongruence** | Claude (cross-reference) | Where voice says X but words say Y |

**Valence** (−1 to +1): How positive or negative the emotional state is
**Arousal** (0 to 1): How energetic or calm the speaker is

---

## Technology Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| API framework | FastAPI | Async-native, WebSocket support, auto OpenAPI docs |
| ORM | SQLAlchemy async | Type-safe, supports SQLite → PostgreSQL migration |
| Database (dev) | SQLite | Zero-config, file-based, no external service |
| Database (prod) | PostgreSQL | ACID, concurrent connections, production-grade |
| Auth | JWT (HS256) | Stateless, works well with WebSocket auth |
| Frontend routing | Next.js App Router | Server components, layouts, loading states |
| State | TanStack Query | Server state caching, background refetch for polling |
| Animations | Framer Motion | Production-quality spring physics |
| Charts | Recharts | Composable, works with Tailwind theming |
| Streaming transcription | Deepgram Nova-2 | Best accuracy + diarization, <500ms latency |
| Voice emotion | Hume AI Prosody | Only model with 48 fine-grained emotional expressions |
| Final transcription | ElevenLabs Scribe | Higher accuracy than Deepgram for post-processing |
| Insights | Claude Opus 4.6 | Best reasoning model for nuanced EQ analysis |

---

## Directory Structure (Full)

```
inflection/
├── README.md
├── setup.sh                           One-time install script
├── start.sh                           Start backend + frontend
│
├── backend/
│   ├── .env.example                   Environment variable template
│   ├── requirements.txt               Python dependencies
│   └── app/
│       ├── __init__.py
│       ├── main.py                    FastAPI app, middleware, router registration
│       ├── config.py                  Pydantic settings (reads from .env)
│       ├── database.py                Async SQLAlchemy engine, session, Base, init_db
│       │
│       ├── models/
│       │   ├── __init__.py
│       │   ├── user.py                User ORM model
│       │   └── session.py             Session + SessionChunk ORM models
│       │
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── auth.py                Register/Login/Token/UserResponse schemas
│       │   └── session.py             Session CRUD schemas
│       │
│       ├── routers/
│       │   ├── __init__.py
│       │   ├── auth.py                /auth/register, /auth/login, /auth/me
│       │   ├── sessions.py            /sessions CRUD + audio summary
│       │   └── ws.py                  WebSocket /ws/session/{id}
│       │
│       ├── services/
│       │   ├── __init__.py
│       │   ├── deepgram_service.py    Transcription + diarization
│       │   ├── hume_service.py        Voice prosody emotion analysis
│       │   ├── elevenlabs_service.py  Scribe transcription + TTS
│       │   ├── claude_service.py      Insight generation + incongruence
│       │   └── pipeline.py            Orchestration (chunk + finalize)
│       │
│       └── utils/
│           ├── __init__.py
│           └── auth.py                JWT helpers, bcrypt, get_current_user
│
├── frontend/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   └── src/
│       ├── types/
│       │   └── index.ts               All TypeScript types (User, Session, Emotions, WsMessages)
│       │
│       ├── lib/
│       │   ├── api.ts                 Axios API client with auth interceptors
│       │   └── utils.ts               cn(), formatters, color mappers
│       │
│       ├── hooks/
│       │   └── useAudioRecorder.ts    MediaRecorder hook with level monitoring
│       │
│       ├── components/
│       │   ├── QueryProvider.tsx      TanStack Query client wrapper
│       │   ├── Navbar.tsx             Top navigation bar
│       │   ├── SessionCard.tsx        Session list item card
│       │   ├── NewSessionModal.tsx    Create session modal
│       │   ├── WaveformVisualizer.tsx Animated audio level bars
│       │   ├── EmotionDisplay.tsx     Dominant emotion + valence/arousal bars
│       │   └── TrendChart.tsx         Recharts area chart for emotion trends
│       │
│       └── app/
│           ├── globals.css            Tailwind base + custom component classes
│           ├── layout.tsx             Root layout (Toaster, QueryProvider)
│           ├── page.tsx               Auth page (login + register)
│           ├── dashboard/
│           │   └── page.tsx           Dashboard (stats, sessions list, trend chart)
│           └── session/
│               ├── live/
│               │   └── page.tsx       Live recording (waveform + real-time display)
│               └── [id]/
│                   └── page.tsx       Session report (full insights + charts)
│
└── docs/
    ├── architecture.md                This file
    ├── backend.md
    ├── frontend.md
    ├── api-reference.md
    ├── ai-services.md
    ├── database.md
    ├── setup-and-running.md
    ├── deployment.md
    └── scaling.md
```
