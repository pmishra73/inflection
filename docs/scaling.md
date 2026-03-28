# Scaling and Commercialization Roadmap

This document outlines the path from a working personal tool to a commercially scalable product — covering technical scaling, feature development, and business model.

---

## Current State (v1.0)

**What works today:**
- Single-user web app running locally
- Full emotion analysis pipeline (Deepgram + Hume + ElevenLabs + Claude)
- Real-time live recording with WebSocket streaming
- Session reports with insights, EQ analysis, action items
- SQLite database (local, file-based)

**Limitations to address before commercial launch:**
- No multi-user isolation / team support
- No billing or plan enforcement
- No rate limiting
- No background job queue (processing blocks the WebSocket)
- Single-server architecture (no horizontal scaling)
- Audio bytes held in memory (memory pressure for long sessions)

---

## Phase 1 — Production Hardening

*Goal: Stable, secure, deployable for early users*

### 1.1 Infrastructure
- [ ] Switch to PostgreSQL (see [database.md](database.md))
- [ ] Deploy backend to Railway/Render, frontend to Vercel
- [ ] Add nginx + SSL for custom domain
- [ ] Set up uptime monitoring (UptimeRobot)
- [ ] Add Sentry for error tracking

### 1.2 Security
- [ ] Enforce strong `SECRET_KEY` in production
- [ ] Add rate limiting on auth and session-create endpoints (`slowapi` library)
- [ ] Add email verification on registration
- [ ] Implement CSRF protection for cookie-based auth (if switching from localStorage)
- [ ] Audit all SQL queries for injection risk (SQLAlchemy parameterizes automatically — just don't use raw SQL)

### 1.3 Reliability
- [ ] Replace `asyncio.gather` in WebSocket with a proper task queue (Celery + Redis) so long AI calls don't block
- [ ] Add retry logic with exponential backoff for all AI API calls
- [ ] Handle API rate limits gracefully (queue + retry vs. fail immediately)
- [ ] Add session recovery: if WebSocket drops mid-session, allow reconnection and continuation
- [ ] Max session duration enforcement (prevent runaway sessions)

### 1.4 User Experience
- [ ] Password reset via email (send reset link)
- [ ] Session search and filtering by date range, type, emotion
- [ ] Bulk session export (JSON or CSV)
- [ ] Better empty states and onboarding flow

---

## Phase 2 — Growth Features

*Goal: Features that drive user retention and sharing*

### 2.1 Mobile App
The current web app works on mobile browsers. For a native experience:

**Option A — Capacitor (recommended)**
Wrap the Next.js frontend as a native iOS/Android app:
```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npx cap add ios
npx cap add android
```
- Access native microphone APIs with lower latency
- Background recording support (key differentiator vs. web)
- Push notifications ("Your session insights are ready")
- App Store / Play Store distribution

**Option B — React Native**
Full native rewrite with better performance. More development effort.

### 2.2 Background Recording (Mobile)
The killer feature for professionals: record passively during meetings.

**iOS:**
- Use `AVAudioSession` with background audio capability
- Register a background task to upload/process chunks
- Show a "Recording" notification in the status bar (legal requirement)

**Android:**
- Foreground Service with ongoing notification
- `AudioRecord` API for raw PCM capture

**Privacy UI:** Always show a prominent recording indicator. Add a "record only with screen on" mode for discretion.

### 2.3 Integrations
- **Calendar integration** — auto-create sessions from Google/Outlook calendar events, auto-title sessions from meeting names
- **Zoom/Meet/Teams integration** — capture audio from video calls directly (requires platform bot APIs)
- **Slack integration** — post session summaries to channels
- **Notion/Obsidian export** — export insights as structured notes
- **CRM integration** — sync action items to Salesforce, HubSpot

### 2.4 Team Features
- **Organizations** — users belong to an org, share sessions with teammates
- **Shared sessions** — invite team members to view a session report
- **Team analytics** — org-level emotion trends across all members' sessions
- **Manager view** — aggregated insights for a direct report's sessions (with consent)
- **Roles** — admin / member / viewer

### 2.5 Real-Time Features
- **Live nudges** (backend already has `generate_realtime_nudge`) — show coaching tips during recording ("Consider slowing down — your energy level is high")
- **Live speaker emotion tags** — show which speaker is currently dominant
- **Live action item detection** — flag "we should..." statements immediately
- **Meeting timer warnings** — alert when approaching planned end time

---

## Phase 3 — Product Differentiation

*Goal: Features competitors can't easily copy*

### 3.1 Longitudinal Emotion Tracking
- Track a user's emotional patterns across weeks/months
- Identify emotional trends: "You tend to feel anxious in Monday morning meetings"
- Compare session types: "Your calls generate more positive emotions than your team meetings"
- Detect burnout signals: "Your engagement scores have been declining for 3 weeks"

### 3.2 Relationship Intelligence
- Track interaction patterns with specific contacts
- "In meetings with Alex, you show significantly more stress indicators"
- Communication coaching: "You tend to interrupt when your arousal is high"

### 3.3 Context-Aware Insights
- Link sessions to outcomes (did the deal close? was the issue resolved?)
- Learn what emotional patterns predict good vs. bad outcomes
- Personalize recommendations based on individual patterns

### 3.4 Advanced Voice Analysis
- Speaking pace analysis (words per minute)
- Talk time distribution (who dominates the conversation)
- Interruption detection
- Volume/energy curve overlay
- Filler word detection ("um", "uh", "like")

### 3.5 AI Coach
- Post-session conversation with Claude about the session
- "Why did the other person seem disengaged in the second half?"
- Pre-meeting preparation: "Based on your history with this person, here's what to watch for"

---

## Technical Scaling Architecture

### Current (Single Server)
```
Browser → FastAPI (1 instance) → SQLite
```

### V2 (Multi-Instance Ready)
```
Browser → Load Balancer → FastAPI (N instances) → PostgreSQL (Primary)
                                                 → PostgreSQL (Read Replicas)
                       → Redis (sessions, rate limiting, pub/sub for WS)
```

### V3 (With Background Processing)
```
Browser → FastAPI (API + WS) → Celery Worker → AI Services
                              → Redis Queue
                              → PostgreSQL
                              → S3 (audio files, if stored)
```

### WebSocket Scaling
Standard WebSocket connections are sticky (they connect to one server instance). For multi-instance deployments:

- Use Redis Pub/Sub to broadcast WebSocket messages across instances
- Or use a managed WebSocket service (Ably, Pusher, AWS API Gateway WebSocket)
- Alternatively: use Server-Sent Events (SSE) for server→client messages, REST for client→server (stateless, scales horizontally)

### Background Job Queue (Celery)
Replace the current inline processing with a job queue:

```python
# Instead of await finalize_session(...)
from celery import Celery
app = Celery('inflection', broker='redis://localhost:6379/0')

@app.task
def finalize_session_task(session_id, mime_type):
    asyncio.run(finalize_session(session_id, None, mime_type, db))

# In WebSocket handler
finalize_session_task.delay(session_id, mime_type)
```

Benefits:
- WebSocket can return immediately after submitting the job
- Jobs survive server restarts
- Scale workers independently from API servers
- Retry failed jobs automatically

---

## Business Model

### Pricing Tiers

| Plan | Price | Features |
|------|-------|---------|
| **Free** | $0/month | 5 sessions/month, 30 min max per session, basic insights |
| **Pro** | $19/month | Unlimited sessions, 3 hour max, full EQ report, audio summaries, exports |
| **Team** | $49/user/month | All Pro + team sharing, org analytics, calendar integration, priority support |
| **Enterprise** | Custom | SSO, on-premise deployment, custom integrations, SLA |

### Cost Structure (Per Session, 1 hour meeting)

| Service | Cost |
|---------|------|
| Deepgram (60 min) | ~$0.26 |
| Hume AI (60 chunks) | ~$0.50 (estimate) |
| ElevenLabs Scribe (60 min audio) | ~$0.20 |
| Claude Opus (insight generation) | ~$0.15 |
| **Total per session** | **~$1.10** |

With Pro at $19/month and ~10 hours of recording = ~$11 API cost → 42% gross margin at usage.
Optimize by: caching, reducing chunk frequency, using cheaper models for shorter sessions.

### Revenue Opportunities
- **B2C:** Professionals who take lots of meetings (sales, managers, consultants)
- **B2B:** Companies that want meeting intelligence for their teams (sell per-seat)
- **API/SDK:** Developers who want emotion analysis as a service (white-label)
- **Data insights:** Anonymized, aggregated emotional intelligence benchmarks by industry

---

## Stripe Integration

```bash
pip install stripe
```

```python
# In a new router: backend/app/routers/billing.py
import stripe
from app.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

@router.post("/billing/checkout")
async def create_checkout(plan: str, current_user = Depends(get_current_user)):
    session = stripe.checkout.Session.create(
        customer_email=current_user.email,
        mode="subscription",
        line_items=[{"price": PLAN_PRICE_IDS[plan], "quantity": 1}],
        success_url="https://yourapp.com/dashboard?upgrade=success",
        cancel_url="https://yourapp.com/dashboard",
        metadata={"user_id": current_user.id}
    )
    return {"checkout_url": session.url}

@router.post("/billing/webhook")
async def stripe_webhook(request: Request):
    # Handle subscription.created, subscription.deleted events
    # Update user.plan in database
    ...
```

Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to `.env`.

---

## App Store Distribution

### iOS (via Capacitor)
1. Wrap Next.js app with Capacitor
2. Add `NSMicrophoneUsageDescription` to `Info.plist`: *"Inflection records audio to analyze emotions in your conversations."*
3. Add Background Audio capability in Xcode
4. Submit to App Store ($99/year Apple Developer account)

### Android (via Capacitor)
1. Add `RECORD_AUDIO` and `FOREGROUND_SERVICE` permissions to `AndroidManifest.xml`
2. Build APK: `npx cap build android`
3. Sign and submit to Google Play ($25 one-time)

### macOS Desktop (via Electron or Tauri)
For a desktop app that can capture system audio (from any app, not just the microphone):
- **Tauri** (Rust-based, smaller bundle size) — recommended
- **Electron** (Node.js-based, larger bundle but more packages)

System audio capture on macOS requires a virtual audio driver (e.g., BlackHole, Loopback) — this is how apps like Plaud record Zoom calls.

---

## Competitive Positioning

| Competitor | Weakness | Inflection's Edge |
|-----------|---------|-------------------|
| Otter.ai | Transcript only, no emotion | Voice emotion + incongruence analysis |
| Fireflies.ai | Limited emotional depth | 48-emotion Hume AI model |
| Plaud | Hardware-dependent | Software-only, no device needed |
| Neo Sapien v1 | Proprietary, limited API access | Open architecture, self-hostable |
| Gong.io | Enterprise only, expensive | Accessible at $19/month |

**Key differentiator:** Emotional incongruence detection — identifying when someone says one thing but their voice communicates another. No competitor currently offers this at the consumer level.
