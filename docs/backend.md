# Backend Documentation

The backend is a Python **FastAPI** application using async SQLAlchemy for the database and WebSockets for real-time audio streaming. All files live under `backend/app/`.

---

## Entry Point

### `app/main.py`

The FastAPI application root. Responsibilities:
- Creates the FastAPI app instance with metadata (title, description, version)
- Registers the `lifespan` context manager which calls `init_db()` on startup to auto-create all database tables
- Adds CORS middleware (allows requests from the Next.js frontend)
- Adds GZip middleware for compressed responses on large payloads
- Mounts all routers under `/api/v1` prefix
- Exposes a `GET /health` endpoint for uptime monitoring

**Key pattern:** The `lifespan` async context manager is the recommended FastAPI way to run startup/shutdown logic without deprecated `@app.on_event` decorators.

---

### `app/config.py`

Pydantic `BaseSettings` class that reads all configuration from environment variables (or `.env` file). Every setting has a default, so the app starts without a `.env` file — but AI features won't work without API keys.

| Setting | Default | Description |
|---------|---------|-------------|
| `SECRET_KEY` | (weak default) | JWT signing key — **must change in production** |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | Token lifetime |
| `DATABASE_URL` | SQLite file | Change to PostgreSQL URL for production |
| `ANTHROPIC_API_KEY` | `""` | Claude API key |
| `DEEPGRAM_API_KEY` | `""` | Deepgram API key |
| `HUME_API_KEY` | `""` | Hume AI API key |
| `HUME_SECRET_KEY` | `""` | Hume AI secret (for signed requests) |
| `ELEVENLABS_API_KEY` | `""` | ElevenLabs API key |
| `FRONTEND_URL` | `http://localhost:3000` | Used in CORS origin allowlist |
| `CHUNK_DURATION_SECONDS` | `5` | How often browser sends audio chunks |

**Usage in other modules:** `from app.config import settings` then `settings.ANTHROPIC_API_KEY`.

---

### `app/database.py`

SQLAlchemy async database setup. Creates:

- `engine` — Async SQLAlchemy engine connecting to `settings.DATABASE_URL`
- `AsyncSessionLocal` — Session factory (configured with `expire_on_commit=False` to avoid lazy-load errors after commits)
- `Base` — Declarative base class that all ORM models inherit from
- `get_db()` — FastAPI dependency that yields a database session and closes it after the request
- `init_db()` — Called on startup; runs `CREATE TABLE IF NOT EXISTS` for all models

**Important:** SQLite requires `check_same_thread=False` for async use — this is conditionally applied only for SQLite connections.

---

## Models (`app/models/`)

ORM classes mapping to database tables. Uses SQLAlchemy 2.0 `Mapped` type annotations for full type safety.

### `models/user.py` — `User` table

Represents an authenticated user account.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (UUID) | Primary key, auto-generated |
| `email` | String | Unique, indexed |
| `name` | String | Display name |
| `password_hash` | String | bcrypt hash — plain password never stored |
| `plan` | Enum | `free` / `pro` / `enterprise` |
| `is_active` | Boolean | Soft-disable accounts without deletion |
| `created_at` | DateTime | UTC |
| `updated_at` | DateTime | Auto-updates on any change |

**Relationship:** `User.sessions` → one-to-many to `Session` (lazy dynamic query).

### `models/session.py` — `Session` and `SessionChunk` tables

**`Session`** — One recording session (a meeting, call, etc.)

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (UUID) | Primary key |
| `user_id` | String (FK) | References `users.id` |
| `title` | String | User-provided name |
| `session_type` | Enum | `meeting` / `call` / `discussion` / `lecture` / `interview` / `other` |
| `status` | Enum | `recording` → `processing` → `completed` \| `failed` |
| `started_at` | DateTime | When recording began |
| `ended_at` | DateTime | When recording stopped (nullable) |
| `duration_seconds` | Integer | Computed on finalization |
| `transcript_segments` | JSON | List of `{speaker, text, start, end}` |
| `full_transcript` | Text | Plain text of entire session |
| `emotion_timeline` | JSON | List of per-chunk emotion snapshots |
| `emotion_summary` | JSON | Aggregated emotion data for the full session |
| `insights` | JSON | Claude-generated structured insights object |
| `participant_count` | Integer | Number of unique speakers detected |
| `participants` | JSON | List of speaker IDs |

**`SessionChunk`** — One 5-second audio segment from a session.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (UUID) | Primary key |
| `session_id` | String (FK) | References `sessions.id` — cascade delete |
| `sequence` | Integer | Order within session (0, 1, 2, …) |
| `transcript` | Text | Deepgram text for this chunk |
| `transcript_segments` | JSON | Speaker-level segments for this chunk |
| `emotions` | JSON | Full Hume AI response for this chunk |
| `sentiment` | String | `positive` / `neutral` / `negative` |
| `sentiment_score` | Float | Confidence score |
| `timestamp_start` | Float | Seconds from session start |
| `timestamp_end` | Float | End of chunk |

---

## Schemas (`app/schemas/`)

Pydantic models for request validation and response serialization. These are separate from ORM models so the database schema and API contract can evolve independently.

### `schemas/auth.py`

| Schema | Direction | Fields |
|--------|-----------|--------|
| `UserRegister` | Request | `email`, `name`, `password` |
| `UserLogin` | Request | `email`, `password` |
| `TokenResponse` | Response | `access_token`, `token_type` |
| `UserResponse` | Response | `id`, `email`, `name`, `plan`, `created_at` |

### `schemas/session.py`

| Schema | Direction | Fields |
|--------|-----------|--------|
| `SessionCreate` | Request | `title`, `session_type` |
| `SessionUpdate` | Request | `title` (optional), `status` (optional) |
| `SessionResponse` | Response | All session fields |
| `SessionListItem` | Response | Subset for dashboard list (no full transcript) |

---

## Routers (`app/routers/`)

HTTP and WebSocket route handlers. Each router is a FastAPI `APIRouter` with its own prefix.

### `routers/auth.py` — prefix: `/api/v1/auth`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Create new user, return JWT |
| POST | `/login` | Validate credentials, return JWT |
| GET | `/me` | Return current user profile (auth required) |

Registration checks for duplicate emails before creating the user. Both endpoints hash the password with bcrypt before storing.

### `routers/sessions.py` — prefix: `/api/v1/sessions`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create a new session record (returns session_id for WS) |
| GET | `/` | List user's sessions (paginated, optional status filter) |
| GET | `/{session_id}` | Get full session detail |
| PATCH | `/{session_id}` | Update title or status |
| DELETE | `/{session_id}` | Delete session and all chunks |
| GET | `/{session_id}/audio-summary` | Stream ElevenLabs TTS of insights (MP3) |

All routes are user-scoped — queries always include `WHERE user_id = current_user.id` to prevent cross-user data access.

### `routers/ws.py` — prefix: `/ws`

**`WebSocket /ws/session/{session_id}?token={jwt}`**

The core real-time endpoint. See [api-reference.md](api-reference.md) for the full protocol.

**`ConnectionManager`** class:
- Tracks active WebSocket connections in a dict `{session_id: websocket}`
- `connect()`, `disconnect()`, `send()` methods
- `send()` silently swallows errors (client may have disconnected)

**Session loop logic:**
1. Authenticate via `token` query param
2. Verify session ownership in database
3. Accept WebSocket, send `{"type": "connected"}`
4. Loop: receive messages → route binary data to chunk processor, JSON to control handler
5. Control messages: `start` (sets mime type), `end` (triggers finalization), `ping`/`pong` keepalive
6. Binary messages: append to `audio_buffer`, spawn async task via `asyncio.create_task`
7. On disconnect with status still `recording`: mark session as `failed`

**Concurrent chunk processing:** Each audio chunk is processed in a separate `asyncio.Task`. This means chunk N+1 starts processing while chunk N is still waiting for API responses. Tasks are tracked in `pending_tasks` and awaited before finalization.

---

## Services (`app/services/`)

The AI integration layer. Each service is isolated and can be used independently or through the orchestrating pipeline.

### `services/deepgram_service.py`

Calls Deepgram's REST transcription API (not the streaming WebSocket, which would require proxying the client's audio directly).

**`transcribe_audio_chunk(audio_bytes, mime_type)`**
- Sends audio to `POST https://api.deepgram.com/v1/listen`
- Parameters: `nova-2` model, `smart_format`, `diarize`, `punctuate`, `utterances`, `sentiment`, `language=en-US`
- Returns: `{transcript, segments, words, sentiment, sentiment_score}`
- Graceful degradation: if API key is missing or request fails, returns empty result

**`_parse_deepgram_response(data)`** (internal)
- Extracts word-level data with speaker attribution
- Builds speaker segments from `utterances` array
- Extracts sentiment from `results.sentiments.average`

### `services/hume_service.py`

Calls Hume AI's Expression Measurement batch API to analyze vocal prosody.

**`analyze_audio_emotion(audio_bytes, mime_type)`**
- Submits a batch job to `POST https://api.hume.ai/v0/batch/jobs`
- Payload includes base64-encoded audio and `prosody` model config with `identify_speakers=True`
- Polls the job with `_poll_hume_job()` (max 30 seconds, 1.5s interval)
- Returns: `{utterances, aggregate, top_emotions, dominant_emotion, valence, arousal}`

**Emotion categories** (used for valence/arousal calculation):
- `positive`: Joy, Excitement, Enthusiasm, Satisfaction, etc.
- `negative`: Anger, Sadness, Fear, Disgust, Contempt, etc.
- `neutral`: Calmness, Concentration, Contemplation, etc.

**`_compute_valence(scores)`** — `(positive_sum − negative_sum) / total` → range −1 to +1

**`_compute_arousal(scores)`** — High arousal emotions (Excitement, Anger, Fear) vs Low (Calmness, Sadness, Tiredness) → range 0 to 1

### `services/elevenlabs_service.py`

Two features: high-quality transcription and TTS narration.

**`transcribe_full_audio(audio_bytes, mime_type)`**
- Calls `POST https://api.elevenlabs.io/v1/speech-to-text` with `scribe_v1` model
- Parameters: `diarize=true`, `timestamps_granularity=word`, `tag_audio_events=true`
- Returns: `{transcript, language, language_probability, words, segments}`
- Segments are built by grouping consecutive words by `speaker_id`

**`generate_tts_summary(text, voice_id)`**
- Calls `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- Uses `eleven_turbo_v2_5` model with Rachel voice (professional, clear)
- Returns MP3 bytes streamed back to the browser via the `/audio-summary` endpoint

### `services/claude_service.py`

Post-session intelligence generation using Claude Opus 4.6.

**`generate_session_insights(transcript, segments, emotion_timeline, emotion_summary, session_type, duration)`**
- Builds a rich prompt including the transcript, emotion scores, valence/arousal, and incongruence signals
- Calls `claude-opus-4-6` with a system prompt defining the role as "expert emotional intelligence analyst"
- Parses JSON from the response (handles markdown code block wrapping)
- Returns a structured `insights` dict with the fields defined below

**Insights schema returned:**

```python
{
  "summary": str,                    # 2-3 sentence executive summary
  "key_topics": [str],               # Main topics discussed
  "action_items": [                  # Tasks identified
    {"item": str, "owner": str, "priority": "high|medium|low"}
  ],
  "decisions_made": [str],           # Decisions reached
  "eq_report": {
    "overall_tone": str,
    "emotional_arc": str,            # How emotions evolved
    "stress_indicators": [str],
    "engagement_level": str,
    "collaboration_quality": str,
    "tension_moments": [str],
    "positive_moments": [str]
  },
  "incongruence_analysis": {
    "detected": bool,
    "examples": [
      {"speaker": str, "words_said": str, "voice_emotion": str, "interpretation": str}
    ],
    "overall_interpretation": str
  },
  "speaker_profiles": [
    {"speaker": str, "dominant_emotions": [str], "communication_style": str,
     "engagement_score": float, "key_contributions": [str]}
  ],
  "recommendations": [
    {"area": str, "suggestion": str, "priority": str}
  ],
  "follow_up_questions": [str],
  "sentiment_overall": str,
  "sentiment_score": float
}
```

**`generate_realtime_nudge(transcript, emotions, session_type)`**
- Uses `claude-haiku-4-5` (fast, cheap) for real-time coaching tips
- Returns a single sentence or `None` (currently available for future real-time nudge feature)

**`_find_incongruences(segments, timeline)`** (internal)
- Simple heuristic: finds utterances where positive words appear with negative voice emotion (or vice versa)
- Returns up to 5 incongruence examples for Claude to interpret

### `services/pipeline.py`

Orchestrates the full processing flow. This is the module that ties all services together.

**`process_audio_chunk(session_id, chunk_sequence, audio_bytes, mime_type, timestamp_start, timestamp_end, db)`**
1. Runs `transcribe_audio_chunk` and `analyze_audio_emotion` concurrently via `asyncio.gather`
2. Handles exceptions from either without failing the whole chunk
3. Saves a `SessionChunk` record to the database
4. Returns a formatted dict for the WebSocket response

**`finalize_session(session_id, full_audio_bytes, mime_type, db)`**
1. Sets session status to `processing`
2. Loads all chunks from DB in order
3. If full audio provided: tries ElevenLabs Scribe; falls back to compiling chunk transcripts
4. Compiles emotion timeline from all chunk emotion data
5. Computes emotion summary (dominant emotion, averages, emotional arc)
6. Detects participant count from unique speaker IDs
7. Calls Claude for insights
8. Updates Session record with all computed data, sets status to `completed`

**`_compile_transcript(chunks)`** — joins chunk transcripts with timestamp offsets applied

**`_compute_emotion_summary(chunks, timeline)`** — averages emotion scores across all chunks, detects arc (improving/declining/stable) by comparing first-third vs last-third valence

---

## Utils (`app/utils/`)

### `utils/auth.py`

Authentication helper functions used across routers.

| Function | Description |
|----------|-------------|
| `hash_password(password)` | bcrypt hash of a plain password |
| `verify_password(plain, hashed)` | bcrypt comparison |
| `create_access_token(data, expires_delta)` | Signs a JWT with `SECRET_KEY` |
| `decode_token(token)` | Decodes JWT, raises `401` on invalid/expired |
| `get_current_user(credentials, db)` | FastAPI dependency — decodes token, loads User from DB, raises `401` if not found or inactive |

`get_current_user` is used as a `Depends()` parameter in all protected endpoints, making auth completely declarative.

---

## Error Handling Philosophy

- **AI service failures are non-fatal.** Every service returns an empty/placeholder result on error. A session can complete with partial data (e.g., transcript present but no emotions if Hume times out).
- **WebSocket errors are logged but don't crash the server.** Individual chunk processing errors send a `chunk_error` message to the client without terminating the session.
- **Database errors bubble up** as 500 responses via FastAPI's default exception handler.
- **Auth errors** are always `401` with a generic message (no information leakage about whether email exists, etc. — **note:** the login endpoint does differentiate "invalid credentials" which could reveal email existence; tighten this in production).
