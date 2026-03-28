# Inflection

**AI-powered emotion intelligence for meetings, calls, and conversations.**

Inflection listens to your conversations and analyzes not just *what* was said, but *how* it was said — extracting voice-level emotions (pitch, energy, tone) and generating deep meeting insights with AI.

---

## Core Capabilities

| Capability | How |
|---|---|
| Real-time transcription with speaker labels | Deepgram Nova-2 streaming |
| Voice emotion analysis (48+ emotions) | Hume AI prosody model |
| High-quality post-session transcription | ElevenLabs Scribe |
| Meeting summary, action items, EQ report | Claude Opus 4.6 |
| Emotional incongruence detection | Claude cross-referencing voice vs. words |
| Spoken insight summaries | ElevenLabs TTS |

---

## Quick Start

```bash
# 1. Install dependencies
./setup.sh

# 2. Add your API keys
nano backend/.env

# 3. Run
./start.sh
```

Open **http://localhost:3000**

---

## API Keys Required

| Service | Get Key At | Free Tier |
|---|---|---|
| Anthropic (Claude) | console.anthropic.com | $5 free credit |
| Deepgram | console.deepgram.com | $200 free credit |
| Hume AI | platform.hume.ai | Free tier |
| ElevenLabs | elevenlabs.io | 10k chars/month |

Add all four to `backend/.env` (copy from `backend/.env.example`).

---

## Tech Stack

```
Frontend   Next.js 14 · TypeScript · Tailwind CSS · Framer Motion · Recharts
Backend    Python · FastAPI · SQLAlchemy · SQLite → PostgreSQL
Auth       JWT (HS256) · bcrypt
Realtime   WebSockets (browser ↔ FastAPI ↔ Deepgram)
AI Layer   Deepgram · Hume AI · ElevenLabs · Anthropic Claude
```

---

## Project Structure

```
inflection/
├── backend/                      Python FastAPI server
│   └── app/
│       ├── main.py               Entry point, CORS, router registration
│       ├── config.py             Settings from environment variables
│       ├── database.py           SQLAlchemy async engine + session
│       ├── models/               SQLAlchemy ORM models
│       ├── schemas/              Pydantic request/response schemas
│       ├── routers/              HTTP + WebSocket route handlers
│       ├── services/             AI service integrations
│       └── utils/                JWT auth helpers
│
├── frontend/                     Next.js 14 app
│   └── src/
│       ├── app/                  Pages (App Router)
│       ├── components/           React UI components
│       ├── hooks/                Custom hooks (audio recorder)
│       ├── lib/                  API client, utility functions
│       └── types/                TypeScript types
│
├── docs/                         Full documentation
├── setup.sh                      One-time install script
├── start.sh                      Start both servers
└── README.md                     This file
```

---

## Documentation

Full documentation is in the [`docs/`](docs/) folder:

| File | Contents |
|---|---|
| [architecture.md](docs/architecture.md) | System design, data flow, component diagram |
| [backend.md](docs/backend.md) | Every backend file explained |
| [frontend.md](docs/frontend.md) | Every frontend file explained |
| [api-reference.md](docs/api-reference.md) | REST endpoints + WebSocket protocol |
| [ai-services.md](docs/ai-services.md) | Deepgram, Hume AI, ElevenLabs, Claude integration details |
| [database.md](docs/database.md) | Schema, models, relationships |
| [setup-and-running.md](docs/setup-and-running.md) | Installation, configuration, troubleshooting |
| [deployment.md](docs/deployment.md) | Production deployment (Vercel + Railway/Render) |
| [scaling.md](docs/scaling.md) | Scaling roadmap and commercialization plan |

---

## License

Private — all rights reserved.
