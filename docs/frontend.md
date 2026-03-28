# Frontend Documentation

The frontend is a **Next.js 14** application using the App Router, TypeScript, Tailwind CSS, and Framer Motion. All source files live under `frontend/src/`.

---

## Configuration Files

### `package.json`
Declares all Node.js dependencies.

**Key production dependencies:**
| Package | Purpose |
|---------|---------|
| `next` | React framework with App Router, SSR, file-based routing |
| `react`, `react-dom` | React 19 |
| `axios` | HTTP client for API calls |
| `recharts` | Composable chart library (AreaChart, RadarChart) |
| `framer-motion` | Animation library (spring physics, layout animations) |
| `lucide-react` | Icon set (Mic, Brain, TrendingUp, etc.) |
| `clsx` + `tailwind-merge` | Conditional class utility → `cn()` helper |
| `date-fns` | Date formatting and duration calculation |
| `zustand` | Lightweight state management (available for future global state) |
| `react-hot-toast` | Toast notification system |
| `@tanstack/react-query` | Server state management, caching, background refetch |
| `wavesurfer.js` | Waveform rendering (available for future enhanced waveform) |

### `tsconfig.json`
TypeScript compiler config. Key setting: `"paths": { "@/*": ["./src/*"] }` enables `@/` absolute imports throughout the codebase.

### `next.config.ts`
Sets up a rewrite rule so `/api/v1/*` requests from the browser are proxied to the FastAPI backend at `http://localhost:8000`. This avoids CORS issues during development.

### `tailwind.config.ts`
Extends Tailwind with the Inflection design system:

**Custom colors:**
- `background` (#0a0a0f) — near-black app background
- `surface` / `surface-2` / `surface-3` — layered card surfaces
- `border` / `border-bright` — subtle borders
- `primary` (#7c6fcd) — purple accent (main brand color)
- `accent.cyan` / `accent.purple` / `accent.green` / `accent.yellow` / `accent.orange` — semantic accents
- `text.primary` / `text.secondary` / `text.muted` — text hierarchy

**Custom animations:** `glow`, `wave`, `slide-up`, `fade-in`, `pulse-slow`

**Custom shadows:** `glow-purple`, `glow-cyan`, `card`

### `postcss.config.mjs`
Standard PostCSS config enabling Tailwind CSS and Autoprefixer.

### `globals.css`
Global styles applied to the entire app:
- Google Fonts import (Inter + JetBrains Mono)
- Tailwind base/components/utilities directives
- Custom scrollbar styling
- Text selection color
- Focus ring styling
- Tailwind component classes: `.glass-card`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input`, `.label`, `.badge`, `.metric-card`
- Waveform bar animation keyframes
- Recording pulse animation
- Gradient text utility (`.gradient-text`)
- Glow utility classes

---

## Types (`src/types/index.ts`)

Single source of truth for all TypeScript types shared across the frontend. Mirrors the backend Pydantic schemas exactly.

**Key types:**

```typescript
// Auth
User { id, email, name, plan, created_at }

// Session
SessionType: "meeting" | "call" | "discussion" | "lecture" | "interview" | "other"
SessionStatus: "recording" | "processing" | "completed" | "failed"
Session { id, title, session_type, status, transcript_segments, emotion_timeline, emotion_summary, insights, ... }
SessionListItem // Subset for list views

// Emotion
EmotionScore { name: string, score: number }
EmotionTimelineEntry { timestamp, dominant_emotion, top_emotions, valence, arousal, ... }
EmotionSummary { dominant_emotion, top_emotions, valence, arousal, emotional_arc, ... }

// Insights
SessionInsights { summary, key_topics, action_items, eq_report, incongruence_analysis, speaker_profiles, ... }

// WebSocket messages (discriminated union)
WsIncomingMessage: { type: "connected" } | { type: "chunk_result", transcript, emotion, ... } | { type: "session_complete", ... } | ...
```

---

## Library (`src/lib/`)

### `lib/api.ts`

Axios-based API client. Creates a single Axios instance pointed at the backend, with two interceptors:

1. **Request interceptor** — reads `inflection_token` from `localStorage` and injects `Authorization: Bearer {token}` header on every request
2. **Response interceptor** — on `401 Unauthorized`, clears the stored token and redirects to `/` (login page)

**Exports:**
- `authApi` — `register()`, `login()`, `me()`
- `sessionsApi` — `create()`, `list()`, `get()`, `update()`, `delete()`, `getAudioSummaryUrl()`

**Example usage:**
```typescript
const { data: session } = await sessionsApi.get(sessionId);
```

### `lib/utils.ts`

Pure utility functions.

| Function | Description |
|----------|-------------|
| `cn(...classes)` | Merges Tailwind classes with conflict resolution via `clsx` + `tailwind-merge` |
| `formatSessionDuration(seconds)` | `90 → "1m 30s"`, `3700 → "1h 1m"` |
| `formatRelativeTime(dateStr)` | `"3m ago"`, `"2h ago"`, `"Jan 15"` |
| `getEmotionColor(emotion)` | Maps emotion names to hex colors (Joy→yellow, Anger→red, Calmness→blue, etc.) |
| `getValenceLabel(valence)` | Maps −1…+1 → `{label: "Positive"|"Neutral"|"Negative", color}` |
| `getArousalLabel(arousal)` | Maps 0…1 → `{label: "High Energy"|"Moderate"|"Low Energy", color}` |
| `getSentimentColor(sentiment)` | Maps sentiment string → hex color |
| `capitalize(s)` | Capitalizes first character |
| `getWsUrl(sessionId, token)` | Builds WebSocket URL from env vars |

---

## Hooks (`src/hooks/`)

### `hooks/useAudioRecorder.ts`

Custom React hook wrapping the browser `MediaRecorder` API with additional features.

**State exposed:**
- `state: "idle" | "requesting" | "recording" | "stopped"` — recording lifecycle
- `error: string | null` — microphone access or recording errors
- `level: number` — audio input level (0–1) for waveform visualization

**Functions:**
- `start()` — requests microphone permission, creates `MediaRecorder`, starts level monitoring
- `stop()` — stops recording, releases microphone, stops level monitoring
- `getMimeTypeInUse()` — returns the actual MIME type being recorded

**Audio configuration:**
```typescript
{ sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
```
Mono 16kHz is optimal for speech recognition APIs.

**MIME type selection:** Tries `audio/webm;codecs=opus` first (most compatible), falls back through webm, ogg, mp4 in order. Uses whatever the browser supports.

**Level monitoring:** Creates a `Web Audio API` `AnalyserNode` connected to the microphone stream. Reads `ByteFrequencyData` at 60fps via `requestAnimationFrame`, averages to produce a 0–1 level value that drives the `WaveformVisualizer`.

---

## Components (`src/components/`)

### `QueryProvider.tsx`

Thin wrapper that creates a `QueryClient` instance and provides it via `QueryClientProvider`. Configured with:
- `retry: 1` (one retry on failure before showing error)
- `staleTime: 30_000` (data considered fresh for 30 seconds, reducing unnecessary refetches)

Must wrap the entire app — placed in `layout.tsx`.

### `Navbar.tsx`

Top navigation bar fixed to the viewport. Features:
- Logo with `Mic` icon linking to `/dashboard`
- Navigation links with active state highlight (compares against `usePathname()`)
- Current user display (fetched via `useQuery` from `/auth/me`)
- Sign out button — clears `localStorage` token, redirects to `/`

The user query uses `retry: false` so it fails silently when unauthenticated (rather than showing error state).

### `SessionCard.tsx`

Dashboard list item for a session. Shows:
- Session type emoji (🤝 meeting, 📞 call, 💬 discussion, etc.)
- Title, status badge with color coding (green=completed, yellow=processing, red=recording/failed)
- Metadata: relative time, duration, participant count
- Top 3 emotion badges with per-emotion colors
- Insight summary preview (first line, truncated)
- Hover-reveal delete button (trash icon)
- "View" button for completed sessions → links to `/session/{id}`

Uses `motion.div` for staggered list entrance animation (delay = `index * 50ms`).

### `NewSessionModal.tsx`

Modal dialog for creating a new session. Animates in with scale + fade using `AnimatePresence`.

Features:
- Session name text input (defaults to "{type} — {date}" if left blank)
- 6-option session type grid (meeting, call, discussion, interview, lecture, other)
- Privacy notice explaining audio handling
- Cancel / "Start Recording" buttons
- On create: calls `sessionsApi.create()`, then calls `onCreated(session)` callback which redirects to live recording

### `WaveformVisualizer.tsx`

Animated waveform bars that respond to audio input level.

- Renders N bars (default 24) in a row
- Bar height is computed from: base height × audio level × distance-from-center factor × sine noise
- Uses Framer Motion `animate={{ height }}` with spring physics for smooth transitions
- Each bar has a staggered `delay` of `i * 10ms` for a ripple effect
- When not recording: bars shrink to minimal height and desaturate

### `EmotionDisplay.tsx`

Reusable component showing the current emotion state. Used in both the live session sidebar and the session report page.

Sections:
1. **Dominant emotion** — name with color-matched dot, animates on change using `AnimatePresence` with scale/fade transition
2. **"LIVE" indicator** — pulsing red dot shown when `isLive=true`
3. **Valence bar** — horizontal progress bar from negative (left) to positive (right)
4. **Arousal/Energy bar** — horizontal progress bar from calm to energetic
5. **Top emotions list** — up to 5 bars showing emotion name, score bar, percentage

All bars animate smoothly using `motion.div` width transitions.

### `TrendChart.tsx`

Recharts `AreaChart` showing valence and arousal trends across sessions on the dashboard.

- X-axis: formatted dates (`"Jan 15"`)
- Y-axis: −1 to +1 range for valence
- Purple area fill: valence trend (solid line)
- Cyan dashed line: arousal trend (overlay)
- Custom tooltip showing both values on hover
- Gradient fills from solid at top to transparent at bottom

---

## Pages (`src/app/`)

### `layout.tsx` — Root Layout

Wraps all pages with:
- Google Fonts link
- `QueryProvider` for TanStack Query
- `Toaster` from `react-hot-toast` (bottom-right position, dark themed)
- Next.js metadata (title, description, keywords, theme color)
- Viewport config for mobile dark mode

### `page.tsx` — Auth Page (`/`)

The landing/authentication page. Automatically redirects to `/dashboard` if a token exists.

Layout: split 50/50 on desktop
- **Left half:** Brand copy, feature grid (4 cards), security disclaimer
- **Right half:** Auth form card

**Auth form features:**
- Toggle between Login and Register modes (animated with `AnimatePresence`)
- Name field slides in/out with height animation when switching to Register
- Form validation (email format, password min length)
- Submit triggers appropriate API call, stores token, redirects
- Error messages displayed via `react-hot-toast`

### `dashboard/page.tsx` — Dashboard (`/dashboard`)

Main hub after login. Guards against unauthenticated access on mount.

**Sections:**
1. **Header** — personalized greeting + "New Session" button
2. **Stats row** — 4 metric cards (total sessions, talk time, avg participants, insights generated). Computed from the session list.
3. **Trend chart + Quick Start panel** — 2/3 + 1/3 grid. Chart shows valence/arousal over last 14 completed sessions. Quick Start shows shortcut buttons for common session types.
4. **Session list** — maps `sessions` to `SessionCard` components, with loading skeleton and empty state CTA.

**Data:** Sessions loaded with `useQuery`, refetched automatically. Delete mutation invalidates the sessions list on success.

**New Session flow:** Opens `NewSessionModal`, which on creation navigates to `/session/live?id={session_id}`.

### `session/live/page.tsx` — Live Recording (`/session/live?id={id}`)

The real-time recording interface. Contains all live session logic.

**Setup (on mount):**
1. Reads `?id` from URL, reads JWT from localStorage
2. Opens WebSocket connection to `ws://localhost:8000/ws/session/{id}?token={jwt}`
3. Starts a 1-second interval timer on WS connect

**WebSocket message handling:**
- `connected` → sends `{"type": "start", "mime_type": "..."}`, starts recording
- `chunk_result` → appends to `chunks` state, updates `currentEmotion`, auto-scrolls transcript
- `session_complete` → shows success toast, redirects to report page after 2 seconds
- `error` / `timeout` → shows error toast

**Audio streaming:**
- `useAudioRecorder` with `chunkDurationMs=5000` sends 5-second chunks
- Each `Blob` chunk → `.arrayBuffer()` → sent as binary over WebSocket
- Full audio also accumulated in `audio_buffer` ref for post-session ElevenLabs transcription

**Layout (3-column on desktop):**
- Left 2/3: waveform visualizer + live transcript feed
- Right 1/3: real-time emotion display + emotion history log

**Stop flow:** Stops recorder → sends `{"type": "end"}` → waits for `session_complete`

Wrapped in `<Suspense>` to handle the `useSearchParams()` requirement for static rendering.

### `session/[id]/page.tsx` — Session Report (`/session/{id}`)

The full post-session analysis page. Polls every 3 seconds while `status === "processing"` using TanStack Query's `refetchInterval`.

**Processing state:** Shows a spinner with explanation of what's happening (ElevenLabs, Claude analysis).

**Top metrics row:** 4 cards — Dominant Emotion, Emotional Valence, Energy Level, Sentiment.

**Main content (2/3 + 1/3 grid):**

Left column sections (each collapsible with toggle):
1. **Executive Summary** — insight summary text + topic badges
2. **Emotional Arc** — recharts AreaChart of valence over time
3. **Action Items** — priority-colored list with owner attribution
4. **Emotional Intelligence Report** — tone, engagement, arc, stress indicators, positive moments
5. **Emotional Incongruence** — if detected: examples of where voice contradicted words
6. **Full Transcript** — scrollable speaker-attributed transcript

Right column:
1. **Emotion Summary** — `EmotionDisplay` component
2. **Emotion Profile** — Recharts RadarChart of top 8 emotions
3. **Recommendations** — prioritized improvement suggestions
4. **Speaker Profiles** — per-speaker emotion + engagement score
5. **Reflect On** — follow-up questions for journaling/reflection

**"Hear Summary" button:** Fetches audio from `/sessions/{id}/audio-summary`, creates an object URL, renders an `<audio>` element for playback.

**Collapsible `Section` component:** Local component inside the file — renders a header with toggle icon, collapses content on click.
