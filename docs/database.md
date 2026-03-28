# Database

Inflection uses **SQLite** for development (zero-config, file-based) and is designed to migrate to **PostgreSQL** for production. The ORM layer (SQLAlchemy async) abstracts the difference.

---

## Configuration

Database URL is set in `backend/.env`:

```env
# Development (default)
DATABASE_URL=sqlite+aiosqlite:///./inflection.db

# Production
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/inflection
```

The database file `inflection.db` is created automatically in the `backend/` directory when the server first starts.

---

## Tables

### `users`

Stores all registered user accounts.

```sql
CREATE TABLE users (
    id          TEXT PRIMARY KEY,           -- UUID v4
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    password_hash TEXT NOT NULL,            -- bcrypt hash
    plan        TEXT DEFAULT 'free',        -- free | pro | enterprise
    is_active   BOOLEAN DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_users_email ON users (email);
```

**Notes:**
- `id` is a UUID string (e.g., `"550e8400-e29b-41d4-a716-446655440000"`) — not an integer. This is intentional for horizontal scaling (no auto-increment coordination needed).
- `password_hash` stores only the bcrypt hash. Plain passwords are never persisted.
- `is_active` allows soft-disabling accounts (e.g., for plan cancellation) without deleting data.

---

### `sessions`

One row per recording session. All AI analysis results are stored as JSON columns.

```sql
CREATE TABLE sessions (
    id                  TEXT PRIMARY KEY,           -- UUID v4
    user_id             TEXT NOT NULL REFERENCES users(id),
    title               TEXT NOT NULL DEFAULT 'Untitled Session',
    session_type        TEXT DEFAULT 'meeting',     -- Enum
    status              TEXT DEFAULT 'recording',   -- Enum
    started_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at            DATETIME,                   -- NULL until session ends
    duration_seconds    INTEGER,                    -- Computed on finalization

    -- Transcript data
    transcript_segments JSON,                       -- [{speaker, text, start, end, ...}]
    full_transcript     TEXT,                       -- Plain text of entire session

    -- Emotion analysis
    emotion_timeline    JSON,                       -- [{timestamp, dominant_emotion, top_emotions, valence, ...}]
    emotion_summary     JSON,                       -- {dominant_emotion, top_emotions, valence, arousal, arc}

    -- AI insights
    insights            JSON,                       -- Full Claude insights object

    -- Participants
    participant_count   INTEGER DEFAULT 1,
    participants        JSON,                       -- ["speaker_0", "speaker_1", ...]

    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Session status lifecycle:**
```
recording  → (on WS "end" received) → processing → completed
                                                  → failed
```

**JSON column schemas:**

`transcript_segments`:
```json
[
  {
    "speaker": "Speaker 1",
    "speaker_id": 0,
    "text": "Let's get started.",
    "start": 0.5,
    "end": 2.1,
    "confidence": 0.97,
    "sentiment": "neutral",
    "sentiment_score": 0.05
  }
]
```

`emotion_timeline`:
```json
[
  {
    "timestamp": 0.0,
    "timestamp_end": 5.0,
    "chunk_sequence": 0,
    "dominant_emotion": "Calmness",
    "top_emotions": [{"name": "Calmness", "score": 0.4}, ...],
    "valence": 0.1,
    "arousal": 0.3,
    "aggregate": {"Calmness": 0.4, "Interest": 0.2, ...}
  }
]
```

`emotion_summary`:
```json
{
  "dominant_emotion": "Enthusiasm",
  "top_emotions": [{"name": "Enthusiasm", "score": 0.38}, ...],
  "average_valence": 0.32,
  "average_arousal": 0.55,
  "valence": 0.32,
  "arousal": 0.55,
  "emotional_arc": "improving",
  "all_scores": {"Enthusiasm": 0.38, "Interest": 0.22, ...}
}
```

---

### `session_chunks`

One row per 5-second audio chunk. Stores intermediate per-chunk results used to compile the final session analysis.

```sql
CREATE TABLE session_chunks (
    id                  TEXT PRIMARY KEY,           -- UUID v4
    session_id          TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sequence            INTEGER NOT NULL,           -- 0, 1, 2, 3, ...
    transcript          TEXT,                       -- Deepgram text for this chunk
    transcript_segments JSON,                       -- Deepgram segments for this chunk
    emotions            JSON,                       -- Full Hume AI response
    sentiment           TEXT,                       -- positive | neutral | negative
    sentiment_score     REAL,                       -- Confidence score
    timestamp_start     REAL NOT NULL DEFAULT 0.0, -- Seconds from session start
    timestamp_end       REAL NOT NULL DEFAULT 0.0,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Notes:**
- `ON DELETE CASCADE` — chunks are automatically deleted when their parent session is deleted
- Chunks are stored with raw emotion data from Hume AI. The aggregated `emotion_summary` on the Session is computed from these chunks during finalization.
- Chunk audio bytes are **not** stored — only processed results. This keeps storage minimal and ensures privacy.

---

## Entity Relationships

```
users (1) ──────────────── (many) sessions
                                      │
                             (1) ─────┴───── (many) session_chunks
```

- One user has many sessions
- One session has many chunks
- Chunks are deleted when their session is deleted (CASCADE)

---

## Async Access Pattern

All database access is async using `sqlalchemy.ext.asyncio`. The standard pattern:

```python
# In a route handler (db injected via Depends)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404)
    return session

# In a service (uses AsyncSessionLocal directly, no dependency injection)
async with AsyncSessionLocal() as db:
    chunk = SessionChunk(...)
    db.add(chunk)
    await db.commit()
```

The WebSocket handler and pipeline services use `AsyncSessionLocal` context managers directly (not FastAPI's `Depends`) because they run outside request/response lifecycle.

---

## Migrations

Currently the app uses `init_db()` which calls `Base.metadata.create_all()` on startup — this creates tables if they don't exist, but **does not run migrations** (schema changes won't be applied to existing databases).

### Setting Up Alembic (Recommended for Production)

`alembic` is included in `requirements.txt`. To set it up:

```bash
cd backend
source venv/bin/activate

# Initialize alembic
alembic init alembic

# Edit alembic/env.py to point to your models and DATABASE_URL
# Then generate your first migration
alembic revision --autogenerate -m "initial schema"

# Apply migrations
alembic upgrade head
```

For SQLite dev + PostgreSQL prod, configure `alembic/env.py` to read `DATABASE_URL` from settings.

---

## Switching to PostgreSQL

1. Install asyncpg driver: `pip install asyncpg psycopg2-binary`
2. Update `DATABASE_URL` in `backend/.env`:
   ```
   DATABASE_URL=postgresql+asyncpg://inflection:password@localhost:5432/inflection
   ```
3. Create database: `createdb inflection`
4. Remove the `check_same_thread` connect arg (already conditional — won't be applied to PostgreSQL)
5. Restart the server — `init_db()` will create tables on first run

No code changes are required. SQLAlchemy abstracts the driver.

---

## Data Retention and Privacy

- **Audio bytes are never persisted** to the database or disk. They flow in memory from WebSocket → services → result.
- **Transcripts are stored** in the sessions table. Users can delete sessions (including all transcript data) via `DELETE /api/v1/sessions/{id}`.
- **Emotion scores are stored** per-chunk and aggregated. These are not personally identifying on their own.
- For GDPR compliance: implement a "delete my account" endpoint that deletes the user row (cascades to sessions → chunks).

---

## Inspecting the Database

```bash
# SQLite (development)
cd backend
sqlite3 inflection.db

# Useful queries
.tables
SELECT id, email, plan FROM users;
SELECT id, title, status, duration_seconds FROM sessions ORDER BY created_at DESC LIMIT 10;
SELECT COUNT(*) FROM session_chunks WHERE session_id = 'your-session-id';
```
