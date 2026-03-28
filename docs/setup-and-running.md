# Setup and Running

Complete guide to getting Inflection running locally from scratch.

---

## Prerequisites

| Requirement | Minimum Version | Check |
|-------------|----------------|-------|
| Python | 3.11+ | `python3 --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | Any | `git --version` |

macOS users: install Python and Node via [Homebrew](https://brew.sh):
```bash
brew install python node
```

---

## Step 1 — Get the Code

```bash
cd ~/Desktop/repos/Inflection
# (code is already here)
```

---

## Step 2 — Run Setup Script

```bash
./setup.sh
```

This script:
1. Creates a Python virtual environment in `backend/venv/`
2. Installs all Python dependencies from `requirements.txt`
3. Copies `backend/.env.example` → `backend/.env`
4. Installs all Node.js dependencies from `frontend/package.json`
5. Copies `frontend/.env.example` → `frontend/.env.local`

If you prefer to do it manually:
```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env

# Frontend
cd ../frontend
npm install --legacy-peer-deps
cp .env.example .env.local
```

---

## Step 3 — Configure API Keys

Edit `backend/.env` and fill in your API keys:

```env
# Required for AI features
ANTHROPIC_API_KEY=sk-ant-api03-...
DEEPGRAM_API_KEY=abc123...
HUME_API_KEY=abc123...
HUME_SECRET_KEY=abc123...
ELEVENLABS_API_KEY=sk_abc123...

# Required for security — generate a random 32+ character string
SECRET_KEY=change-this-to-a-random-32-character-string-now

# Leave these at defaults for local development
DATABASE_URL=sqlite+aiosqlite:///./inflection.db
FRONTEND_URL=http://localhost:3000
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

### Getting API Keys

**Anthropic (Claude)**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to API Keys → Create Key
4. Copy the `sk-ant-...` key

**Deepgram**
1. Go to [console.deepgram.com](https://console.deepgram.com)
2. Sign up (free $200 credit)
3. Dashboard → API Keys → Create a New API Key
4. Copy the key

**Hume AI**
1. Go to [platform.hume.ai](https://platform.hume.ai)
2. Sign up
3. Settings → API Keys → Create Key
4. Copy both the API Key and Secret Key

**ElevenLabs**
1. Go to [elevenlabs.io](https://elevenlabs.io)
2. Sign up (free tier: 10k chars/month)
3. Profile → API Key
4. Copy the `sk_...` key

---

## Step 4 — Start the App

```bash
./start.sh
```

This starts both servers and waits for the backend to be ready before starting the frontend.

**What you'll see:**
```
▶ Starting FastAPI backend on http://localhost:8000 ...
  Waiting for backend...
  ✓ Backend ready

▶ Starting Next.js frontend on http://localhost:3000 ...

╔══════════════════════════════════════════════╗
║  App running!                                ║
║  Frontend: http://localhost:3000             ║
║  Backend:  http://localhost:8000             ║
║  API Docs: http://localhost:8000/docs        ║
╚══════════════════════════════════════════════╝
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Press **Ctrl+C** to stop both servers.

---

## Running Servers Individually

If you want to run the backend and frontend in separate terminals:

**Terminal 1 — Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The `--reload` flag enables hot-reloading on code changes (development only).

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | Yes | (weak default) | JWT signing secret — use 32+ random chars |
| `ALGORITHM` | No | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `10080` | Token lifetime (7 days) |
| `DATABASE_URL` | No | SQLite | Database connection string |
| `ANTHROPIC_API_KEY` | Yes (for insights) | `""` | Claude API key |
| `DEEPGRAM_API_KEY` | Yes (for live transcript) | `""` | Deepgram API key |
| `HUME_API_KEY` | Yes (for emotions) | `""` | Hume AI API key |
| `HUME_SECRET_KEY` | No | `""` | Hume AI secret key |
| `ELEVENLABS_API_KEY` | Yes (for HQ transcript/TTS) | `""` | ElevenLabs API key |
| `FRONTEND_URL` | No | `http://localhost:3000` | Allowed CORS origin |
| `CHUNK_DURATION_SECONDS` | No | `5` | Audio chunk size |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend URL for REST requests |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000` | Backend URL for WebSocket |

---

## Verifying Everything Works

### 1. Health check
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","version":"1.0.0"}
```

### 2. API docs
Open [http://localhost:8000/docs](http://localhost:8000/docs) — you should see FastAPI's Swagger UI with all endpoints.

### 3. Register an account
Open [http://localhost:3000](http://localhost:3000), click "Sign Up", create an account. You should be redirected to the dashboard.

### 4. Test a session (without API keys)
You can create a session and start recording even without API keys. The transcript and emotion fields will be empty, but the session lifecycle (create → record → finalize → complete) will work. This is useful for testing the UI without burning API credits.

---

## Troubleshooting

### "Port 8000 already in use"
```bash
lsof -ti:8000 | xargs kill -9
```

### "Port 3000 already in use"
```bash
lsof -ti:3000 | xargs kill -9
```

### "Microphone access denied" in browser
- The browser requires HTTPS for microphone access on non-localhost origins
- For local development, `localhost` is exempted — this should work
- If using a custom domain locally, set up a self-signed cert or use `ngrok`

### Backend fails to start: "No module named 'app'"
Make sure you're running uvicorn from the `backend/` directory with the venv activated:
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --port 8000 --reload
```

### Frontend fails: "Cannot find module"
```bash
cd frontend
rm -rf node_modules .next
npm install --legacy-peer-deps
```

### Hume AI timeouts
Hume's batch API can be slow. If chunks time out (>30s), increase the polling timeout in `hume_service.py`:
```python
predictions = await _poll_hume_job(client, job_id, headers, max_wait=60)  # Increase from 30
```

### "Invalid token" on WebSocket connection
Tokens expire after 7 days by default. Log out and log back in to get a fresh token.

### Sessions stuck in "processing"
If the backend crashes during post-session processing, sessions may be stuck in `processing` status. Reset them:
```bash
cd backend
source venv/bin/activate
python3 -c "
import asyncio
from app.database import AsyncSessionLocal
from app.models.session import Session, SessionStatus
from sqlalchemy import select, update

async def reset():
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Session).where(Session.status == SessionStatus.processing).values(status=SessionStatus.failed)
        )
        await db.commit()
        print('Done')

asyncio.run(reset())
"
```

---

## Development Tips

### Hot reload
- Backend: `--reload` flag watches all Python files and restarts on changes
- Frontend: Next.js dev server hot-reloads automatically

### Database reset (start fresh)
```bash
cd backend
rm -f inflection.db
# Database recreates automatically on next server start
```

### Viewing logs
Backend logs all AI service calls and WebSocket events at INFO level:
```
2026-03-28 10:00:01 | INFO | app.services.hume_service | Hume job abc123 completed
2026-03-28 10:00:03 | INFO | app.routers.ws | WS connected: session def456
```

### Testing API endpoints directly
```bash
# Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","name":"Test User","password":"password123"}'

# Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# List sessions
curl http://localhost:8000/api/v1/sessions -H "Authorization: Bearer $TOKEN"
```
