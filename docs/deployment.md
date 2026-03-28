# Deployment

Guide to deploying Inflection to production. The recommended stack is:

- **Frontend** → [Vercel](https://vercel.com) (zero-config Next.js hosting)
- **Backend** → [Railway](https://railway.app) or [Render](https://render.com) (managed Python hosting)
- **Database** → PostgreSQL (managed, via Railway/Render/Supabase)

---

## Pre-Deployment Checklist

Before deploying, complete these security and configuration steps:

- [ ] Generate a strong `SECRET_KEY` (32+ random characters)
- [ ] Switch `DATABASE_URL` to PostgreSQL
- [ ] Set `FRONTEND_URL` to your production domain
- [ ] All four AI API keys added to environment variables
- [ ] Remove `--reload` from uvicorn command
- [ ] Set `NODE_ENV=production` for the frontend

Generate a secure `SECRET_KEY`:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## Option A — Railway (Backend + PostgreSQL)

Railway is the simplest option — one platform for the backend and database with automatic deployments.

### 1. Create a Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create a new project from the backend directory
cd backend
railway init
```

### 2. Add PostgreSQL

In the Railway dashboard:
1. Click **New** → **Database** → **PostgreSQL**
2. Railway auto-creates `DATABASE_URL` in your project variables

### 3. Set Environment Variables

In Railway dashboard → your service → Variables:

```
SECRET_KEY=<generated 32+ char key>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
ANTHROPIC_API_KEY=sk-ant-...
DEEPGRAM_API_KEY=...
HUME_API_KEY=...
HUME_SECRET_KEY=...
ELEVENLABS_API_KEY=sk_...
FRONTEND_URL=https://your-app.vercel.app
```

`DATABASE_URL` is auto-set from the linked PostgreSQL service.

### 4. Configure Start Command

In Railway dashboard → service settings → Start Command:
```
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Railway sets `$PORT` automatically.

### 5. Deploy

```bash
cd backend
railway up
```

Railway detects `requirements.txt` and builds automatically. Your backend URL will be something like `https://inflection-backend.railway.app`.

---

## Option B — Render (Backend + PostgreSQL)

### 1. Create Web Service

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo
3. Set **Root Directory**: `backend`
4. **Build Command**: `pip install -r requirements.txt`
5. **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### 2. Add PostgreSQL

1. New → PostgreSQL
2. Copy the **Internal Database URL** and set it as `DATABASE_URL` in your web service environment

### 3. Environment Variables

Add all variables in Render dashboard → Environment tab.

---

## Deploying the Frontend (Vercel)

### 1. Push Frontend to GitHub

If it's not already in a repo:
```bash
cd frontend
git init
git add .
git commit -m "Initial frontend"
git remote add origin https://github.com/yourname/inflection-frontend
git push -u origin main
```

### 2. Import on Vercel

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repository
3. Set **Root Directory**: `frontend`
4. Framework: **Next.js** (auto-detected)

### 3. Set Environment Variables

In Vercel → Project Settings → Environment Variables:

```
NEXT_PUBLIC_API_URL=https://inflection-backend.railway.app
NEXT_PUBLIC_WS_URL=wss://inflection-backend.railway.app
```

Note: Use `wss://` (WebSocket Secure) for production HTTPS domains.

### 4. Deploy

Click **Deploy**. Vercel builds and deploys automatically. Future pushes to `main` trigger redeployment.

---

## HTTPS and WebSockets

In production, all connections must use HTTPS and WSS:

- Frontend: `https://your-app.vercel.app`
- Backend REST: `https://your-backend.railway.app`
- Backend WebSocket: `wss://your-backend.railway.app/ws/session/{id}?token={jwt}`

Railway and Render both provision SSL certificates automatically. No configuration needed.

Update `frontend/.env` (Vercel environment variables):
```
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
NEXT_PUBLIC_WS_URL=wss://your-backend.railway.app
```

---

## Database Migration for Production

When switching from SQLite to PostgreSQL, the database schema is created fresh by `init_db()` on first startup. If you later change the schema:

```bash
# Install alembic (already in requirements.txt)
cd backend
source venv/bin/activate

# One-time setup
alembic init alembic
# Edit alembic/env.py to import your models and use settings.DATABASE_URL

# Create migration
alembic revision --autogenerate -m "describe your change"

# Apply
alembic upgrade head
```

For Railway/Render, run migrations as a one-off command before deploying:
```bash
# Railway
railway run alembic upgrade head

# Render
# Add a pre-deploy command in render.yaml
```

---

## Docker Deployment (Self-Hosted)

For self-hosted or custom VPS deployment:

**`backend/Dockerfile`:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**`frontend/Dockerfile`:**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

CMD ["node", "server.js"]
```

**`docker-compose.yml`:**
```yaml
version: "3.9"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: inflection
      POSTGRES_USER: inflection
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://inflection:${DB_PASSWORD}@db:5432/inflection
      SECRET_KEY: ${SECRET_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      DEEPGRAM_API_KEY: ${DEEPGRAM_API_KEY}
      HUME_API_KEY: ${HUME_API_KEY}
      ELEVENLABS_API_KEY: ${ELEVENLABS_API_KEY}
      FRONTEND_URL: ${FRONTEND_URL}
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
      NEXT_PUBLIC_WS_URL: ws://localhost:8000

volumes:
  pg_data:
```

Run:
```bash
cp .env.example .env   # Fill in secrets
docker-compose up -d
```

---

## Reverse Proxy (nginx)

For production self-hosting, use nginx as a reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    # REST API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket (important: upgrade headers)
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 300s;   # Long timeout for recording sessions
        proxy_send_timeout 300s;
    }
}
```

The `proxy_read_timeout` is critical for WebSockets — the default nginx timeout (60s) will kill long recording sessions.

---

## Monitoring and Observability

### Logging
The backend uses Python's standard `logging` module. In production, redirect to a log aggregator:

```python
# In main.py, update logging config
import logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[
        logging.StreamHandler(),           # stdout (captured by Railway/Render)
        logging.FileHandler("app.log"),    # optional file logging
    ]
)
```

Railway and Render capture stdout automatically and display it in their dashboards.

### Health Check Monitoring
Set up uptime monitoring on `GET /health`:
- [UptimeRobot](https://uptimerobot.com) (free)
- [Better Uptime](https://betteruptime.com)
- Ping every 5 minutes, alert on failure

### Error Tracking
Add [Sentry](https://sentry.io) for exception tracking:
```bash
pip install sentry-sdk[fastapi]
```

```python
# In main.py
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(dsn="your-sentry-dsn", integrations=[FastApiIntegration()])
```

---

## Environment Variables Summary (Production)

```env
# Security
SECRET_KEY=<32+ char random key>
ALGORITHM=HS256

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/inflection

# AI Keys
ANTHROPIC_API_KEY=sk-ant-...
DEEPGRAM_API_KEY=...
HUME_API_KEY=...
HUME_SECRET_KEY=...
ELEVENLABS_API_KEY=sk_...

# CORS
FRONTEND_URL=https://your-app.vercel.app

# Optional
ACCESS_TOKEN_EXPIRE_MINUTES=10080
CHUNK_DURATION_SECONDS=5
```
