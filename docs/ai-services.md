# AI Services

Inflection integrates four AI APIs. Each service is isolated in its own service module so it can be swapped, upgraded, or disabled independently.

---

## Service Overview

| Service | Role | When Used | Latency |
|---------|------|-----------|---------|
| **Deepgram** | Real-time transcription + diarization | Per audio chunk (live) | ~1–2s per chunk |
| **Hume AI** | Voice prosody emotion analysis | Per audio chunk (live) | ~5–15s per chunk |
| **ElevenLabs** | High-quality transcription + TTS | Post-session (once) | ~10–30s for full audio |
| **Claude Opus** | Insight generation | Post-session (once) | ~15–30s |

All services degrade gracefully — if an API key is missing or a call fails, the system returns empty/placeholder data rather than crashing.

---

## Deepgram

**File:** `backend/app/services/deepgram_service.py`
**API:** REST `POST https://api.deepgram.com/v1/listen`
**Model:** `nova-2` (Deepgram's most accurate general-purpose model)

### What It Does

Transcribes 5-second audio chunks with:
- **Speaker diarization** — identifies who is speaking (Speaker 0, Speaker 1, etc.)
- **Word-level timestamps** — exact start/end time for every word
- **Smart formatting** — adds punctuation, capitalizes names, formats numbers
- **Utterance detection** — groups words into complete utterances per speaker
- **Sentiment analysis** — positive/neutral/negative per utterance with confidence score

### Request Parameters

```python
params = {
    "model": "nova-2",
    "smart_format": "true",     # punctuation, capitalization
    "diarize": "true",          # speaker identification
    "punctuate": "true",        # sentence punctuation
    "utterances": "true",       # grouped speaker utterances
    "sentiment": "true",        # per-utterance sentiment
    "language": "en-US",
}
```

### Response Structure

Deepgram returns a nested JSON. The parser extracts:

```python
{
    "transcript": "Let's move to the next item.",        # Full chunk text
    "words": [                                            # Word-level detail
        {"word": "Let's", "start": 0.1, "end": 0.4, "speaker": 0, "confidence": 0.98},
        ...
    ],
    "segments": [                                         # Speaker segments
        {
            "speaker": "Speaker 1",
            "speaker_id": 0,
            "text": "Let's move to the next item.",
            "start": 0.1, "end": 2.3,
            "confidence": 0.97,
            "sentiment": "neutral",
            "sentiment_score": 0.05
        }
    ],
    "sentiment": "neutral",         # Overall chunk sentiment
    "sentiment_score": 0.05
}
```

### Pricing (approximate)
- Pay-as-you-go: ~$0.0043/minute for Nova-2 with all features
- $200 free credit on signup — covers ~780 hours of transcription

### Alternatives
If Deepgram is unavailable or too expensive, swap the service module with:
- **AssemblyAI** — similar features, slightly different API
- **OpenAI Whisper** — self-hosted option for maximum privacy, no diarization
- **Google Speech-to-Text v2** — enterprise option with Google ecosystem

---

## Hume AI

**File:** `backend/app/services/hume_service.py`
**API:** Batch `POST https://api.hume.ai/v0/batch/jobs`
**Model:** Prosody (Expression Measurement)

### What It Does

Analyzes the acoustic properties of speech (not the words) to detect emotional expressions. This is what humans do when they "read between the lines" — hearing nervousness, enthusiasm, or sadness in someone's voice even when their words are neutral.

**48+ emotions detected** from a single audio clip:
```
Admiration, Adoration, Aesthetic Appreciation, Amusement, Anger, Anxiety, Awe,
Awkwardness, Boredom, Calmness, Concentration, Confusion, Contemplation, Contempt,
Contentment, Craving, Determination, Disappointment, Disgust, Distress, Doubt,
Ecstasy, Embarrassment, Empathic Pain, Enthusiasm, Entrancement, Envy, Excitement,
Fear, Guilt, Horror, Interest, Joy, Love, Nostalgia, Pain, Pride, Realization,
Relief, Sadness, Satisfaction, Shame, Surprise (negative), Surprise (positive),
Sympathy, Tiredness, Triumph
```

### How It Works

1. **Submit job:** POST audio (base64-encoded) with `prosody` model config
2. **Poll for results:** GET job status every 1.5 seconds (max 30 second timeout)
3. **Parse response:** Extract per-utterance emotion scores, aggregate across utterances

```python
# Job submission payload
{
    "models": {
        "prosody": {
            "granularity": "utterance",     # Analyze per utterance (not per word)
            "identify_speakers": True        # Attempt speaker differentiation
        }
    },
    "files": [
        {
            "filename": "chunk.webm",
            "content_type": "audio/webm",
            "data": "<base64_encoded_audio>"
        }
    ]
}
```

### Output Structure

```python
{
    "utterances": [
        {
            "speaker_id": "speaker_0",
            "time_start": 0.0,
            "time_end": 3.2,
            "emotions": {
                "Joy": 0.12,
                "Enthusiasm": 0.41,
                "Interest": 0.22,
                "Calmness": 0.08,
                # ... all 48 emotions with scores
            },
            "top_emotions": [
                {"name": "Enthusiasm", "score": 0.41},
                {"name": "Interest", "score": 0.22},
                ...
            ],
            "dominant_emotion": "Enthusiasm"
        }
    ],
    "aggregate": {                          # Averaged across all utterances
        "Enthusiasm": 0.38,
        "Interest": 0.20,
        ...
    },
    "top_emotions": [...],                  # Top 10 from aggregate
    "dominant_emotion": "Enthusiasm",
    "valence": 0.52,                        # -1 to +1 (computed)
    "arousal": 0.68                         # 0 to 1 (computed)
}
```

### Valence and Arousal Computation

These two dimensions are not returned by Hume directly — they're computed from the emotion scores:

**Valence** = `(sum of positive emotion scores − sum of negative emotion scores) / total`
- Positive emotions: Joy, Excitement, Enthusiasm, Satisfaction, Contentment, Amusement, Pride, Triumph, Love, Admiration
- Negative emotions: Anger, Sadness, Fear, Disgust, Contempt, Distress, Guilt, Shame, Horror, Disappointment

**Arousal** = `high-arousal emotions / (high + low arousal emotions)`
- High arousal: Excitement, Anger, Fear, Enthusiasm, Triumph, Horror, Ecstasy
- Low arousal: Calmness, Contentment, Boredom, Tiredness, Sadness, Nostalgia

### Latency Notes

Hume AI's batch API takes 5–15 seconds per submission. This is a fundamental limitation of their batch architecture. Options to mitigate:
- Process emotion in parallel with transcription (already done)
- Increase chunk duration to 10–15 seconds to reduce job overhead
- Use Hume's streaming API (EVI — Empathic Voice Interface) for true real-time (different API, conversational context)

### Pricing
Hume offers a free tier for development. Production pricing is usage-based — check platform.hume.ai.

---

## ElevenLabs

**File:** `backend/app/services/elevenlabs_service.py`
**APIs used:**
- `POST https://api.elevenlabs.io/v1/speech-to-text` (Scribe)
- `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`

### 1. Scribe — High-Quality Transcription

Called once at the end of a session to produce a higher-quality transcript than the real-time Deepgram chunks.

**Advantages over Deepgram for post-processing:**
- Higher accuracy on complex vocabulary and proper nouns
- Better sentence boundary detection
- Returns audio event tags (laughter, applause, etc.)

**Request:**
```python
files = {"file": ("session.webm", audio_bytes, "audio/webm")}
data = {
    "model_id": "scribe_v1",
    "diarize": "true",
    "timestamps_granularity": "word",    # Word-level timestamps
    "tag_audio_events": "true",          # Tag [laughter], [applause], etc.
}
```

**Output parsed into:**
```python
{
    "transcript": "Full session text",
    "language": "en",
    "language_probability": 0.98,
    "words": [
        {"text": "Hello", "type": "word", "start": 0.1, "end": 0.4, "speaker_id": "speaker_0"},
        {"text": " ", "type": "spacing"},
        {"text": "[laughter]", "type": "audio_event"},
        ...
    ],
    "segments": [
        {"speaker_id": "speaker_0", "speaker": "Speaker 1", "text": "...", "start": 0.1, "end": 4.2}
    ]
}
```

**Fallback behavior:** If ElevenLabs fails or no API key is set, `pipeline.py` falls back to compiling the transcript from the per-chunk Deepgram results.

### 2. TTS — Spoken Summary

Generates an MP3 audio file reading the session's summary insight aloud. The user can click "Hear Summary" on the session report page to listen.

**Voice:** Rachel (`21m00Tcm4TlvDq8ikWAM`) — clear, professional, calm voice suitable for business summaries.

**Model:** `eleven_turbo_v2_5` — ElevenLabs' fast, high-quality model optimized for natural speech.

**Voice settings:**
```python
{
    "stability": 0.5,           # 0=expressive, 1=monotone. 0.5=balanced
    "similarity_boost": 0.8,    # How closely to match the cloned voice
    "style": 0.2,               # Speaking style intensity
    "use_speaker_boost": True   # Enhance clarity
}
```

### Pricing
- Free tier: 10,000 characters/month
- Scribe pricing: per audio hour
- TTS pricing: per character

---

## Anthropic Claude

**File:** `backend/app/services/claude_service.py`
**SDK:** `anthropic` Python SDK (async)
**Model:** `claude-opus-4-6` for insights, `claude-haiku-4-5-20251001` for real-time nudges

### What It Does

Claude is the "brain" of the insights layer. It receives:
- The full session transcript
- Speaker segments
- Hume AI emotion scores and valence/arousal
- Emotional incongruence signals (pre-computed heuristically)

And generates a comprehensive structured JSON report.

### System Prompt

```
You are an expert emotional intelligence analyst and meeting coach.
You analyze conversations for emotional patterns, communication quality,
and actionable insights. You have access to both the words spoken
(transcript) and the voice-level emotions detected by AI
(how the words were said — pitch, energy, prosody).

Your analysis is sharp, empathetic, and professionally useful.
Always return valid JSON matching the exact schema requested.
```

### Insights Schema Generated

Claude is instructed to return this exact JSON structure every time:

```
summary                     2-3 sentence executive summary
key_topics                  List of main topics discussed
action_items                Tasks with owner and priority (high/medium/low)
decisions_made              Explicit decisions reached
eq_report
  overall_tone              How the session felt emotionally
  emotional_arc             How emotions evolved (beginning to end)
  stress_indicators         Signs of pressure or tension
  engagement_level          high / medium / low
  engagement_reason         Why engagement was that level
  collaboration_quality     How well people worked together
  tension_moments           Specific moments of tension
  positive_moments          Specific moments of positive energy
incongruence_analysis
  detected                  Whether incongruence was found
  examples                  Speaker + words + voice emotion + interpretation
  overall_interpretation    What it suggests about the conversation dynamics
speaker_profiles
  (per speaker)             Dominant emotions, communication style, engagement score
recommendations             Prioritized improvement suggestions
follow_up_questions         Reflective questions for journaling
sentiment_overall           positive / neutral / negative / mixed
sentiment_score             -1.0 to +1.0
```

### Incongruence Detection (Pre-Processing)

Before sending to Claude, the service runs a lightweight heuristic to flag potential incongruences — these are passed to Claude for interpretation:

```python
# Positive text words
positive_words = {"great", "good", "excellent", "perfect", "happy", "love", "agree", "absolutely", "yes"}
# Negative voice emotions
negative_voice = {"Anger", "Disgust", "Contempt", "Sadness", "Fear", "Distress"}

# Flag segments where these conflict
if has_positive_text and has_negative_voice:
    → mark as "positive_words_negative_voice" incongruence
```

Claude then adds human interpretation: "May indicate the speaker feels social pressure to agree despite genuine concern."

### Nudge Feature (Available but Not Yet Wired to UI)

`generate_realtime_nudge()` uses Claude Haiku for cost-effective real-time suggestions during a session. Currently computed but not pushed to the UI — ready to enable by sending the nudge in the WebSocket `chunk_result` message.

### Model Choice

| Model | Used for | Why |
|-------|---------|-----|
| `claude-opus-4-6` | Post-session insights | Best reasoning for nuanced EQ analysis; used once per session |
| `claude-haiku-4-5-20251001` | Real-time nudges | Cheap and fast; runs on every chunk if enabled |

### Pricing
- Opus 4.6: input ~$15/M tokens, output ~$75/M tokens. A typical 1-hour meeting insight costs ~$0.10–0.30.
- Haiku: ~10x cheaper — suitable for real-time use.

---

## Service Interaction Summary

```
Audio Chunk (5s)
       │
       ├──► Deepgram REST API ─────────────────────┐
       │    • Nova-2 model                          │
       │    • ~1-2s response                        │
       │    • Returns: transcript + segments        │
       │                                            │
       └──► Hume AI Batch API ───────────────────┐  │
            • Prosody model                      │  │
            • ~5-15s response (polled)           │  │
            • Returns: 48 emotion scores         │  │
                                                 ▼  ▼
                                     Combined chunk result
                                     → WebSocket to browser
                                     → Saved to SessionChunk DB

Session End
       │
       ├──► ElevenLabs Scribe ─────────────────────┐
       │    • Full audio (concatenated chunks)      │
       │    • ~10-30s response                      │
       │    • Returns: HQ transcript + speakers     │
       │                                            ▼
       │                                 Compiled transcript + segments
       │                                            │
       └──────────────────────────────────────────┐ │
                                                  ▼ ▼
                                         Claude Opus 4.6
                                         • Full prompt with transcript
                                           + emotion data
                                         • ~15-30s response
                                         • Returns: full insights JSON
                                                   │
                                                   ▼
                                         Session record updated
                                         → status: "completed"
                                         → Browser redirected to report
```
