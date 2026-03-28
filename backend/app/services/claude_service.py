"""
Claude service — post-session insight generation.
Generates structured insights: summary, action items, emotional intelligence report,
emotional incongruence detection (where voice emotion contradicts word meaning).
"""
import json
import logging
from anthropic import AsyncAnthropic
from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY) if settings.ANTHROPIC_API_KEY else None

INSIGHT_SYSTEM_PROMPT = """You are an expert emotional intelligence analyst and meeting coach.
You analyze conversations for emotional patterns, communication quality, and actionable insights.
You have access to both the words spoken (transcript) and the voice-level emotions detected
by AI (how the words were said — pitch, energy, prosody).

Your analysis is sharp, empathetic, and professionally useful.
Always return valid JSON matching the exact schema requested."""


async def generate_session_insights(
    transcript: str,
    transcript_segments: list,
    emotion_timeline: list,
    emotion_summary: dict,
    session_type: str,
    duration_seconds: int,
) -> dict:
    """
    Generate comprehensive post-session insights using Claude.
    Returns a rich insights object with summary, actions, EQ report, etc.
    """
    if not client:
        logger.warning("Anthropic API key not set — returning placeholder insights")
        return _placeholder_insights()

    # Prepare emotion context
    dominant_emotions = [e["name"] for e in emotion_summary.get("top_emotions", [])[:5]]
    valence = emotion_summary.get("valence", 0)
    arousal = emotion_summary.get("arousal", 0.5)

    # Build incongruence signals from timeline
    incongruence_examples = _find_incongruences(transcript_segments, emotion_timeline)

    prompt = f"""Analyze this {session_type} session ({duration_seconds // 60} min {duration_seconds % 60} sec).

## TRANSCRIPT
{transcript[:8000]}

## SPEAKER SEGMENTS (sample)
{json.dumps(transcript_segments[:20], indent=2)}

## VOICE EMOTION ANALYSIS
- Dominant emotions detected (from voice prosody): {', '.join(dominant_emotions)}
- Emotional valence: {valence:.2f} (-1=very negative, +1=very positive)
- Emotional arousal: {arousal:.2f} (0=very calm, 1=very energetic)
- Full emotion summary: {json.dumps(emotion_summary, indent=2)[:2000]}

## EMOTIONAL INCONGRUENCE SIGNALS
{json.dumps(incongruence_examples, indent=2)}

Return a JSON object with EXACTLY this structure:
{{
  "summary": "2-3 sentence executive summary of the session",
  "key_topics": ["topic1", "topic2", "topic3"],
  "action_items": [
    {{"item": "description", "owner": "Speaker X or Unknown", "priority": "high|medium|low"}}
  ],
  "decisions_made": ["decision1", "decision2"],
  "eq_report": {{
    "overall_tone": "description of the session's emotional tone",
    "emotional_arc": "how emotions evolved across the session",
    "stress_indicators": ["indicator1", "indicator2"],
    "engagement_level": "high|medium|low",
    "engagement_reason": "why",
    "collaboration_quality": "description",
    "tension_moments": ["moment1"],
    "positive_moments": ["moment1"]
  }},
  "incongruence_analysis": {{
    "detected": true/false,
    "examples": [
      {{"speaker": "Speaker X", "words_said": "...", "voice_emotion": "...", "interpretation": "what this might mean"}}
    ],
    "overall_interpretation": "what the incongruences suggest about the conversation"
  }},
  "speaker_profiles": [
    {{
      "speaker": "Speaker 1",
      "dominant_emotions": ["emotion1", "emotion2"],
      "communication_style": "description",
      "engagement_score": 0.0-1.0,
      "key_contributions": ["contribution1"]
    }}
  ],
  "recommendations": [
    {{"area": "area name", "suggestion": "actionable suggestion", "priority": "high|medium|low"}}
  ],
  "follow_up_questions": ["question to reflect on 1", "question 2"],
  "sentiment_overall": "positive|neutral|negative|mixed",
  "sentiment_score": -1.0 to 1.0,
  "meeting_minutes": {{
    "attendees": ["Speaker 1", "Speaker 2"],
    "agenda_items": ["topic discussed 1", "topic discussed 2"],
    "discussion_highlights": [
      {{"topic": "topic name", "summary": "what was discussed", "outcome": "what was decided or concluded"}}
    ],
    "decisions_formal": ["formal decision 1", "formal decision 2"],
    "action_items_formal": [
      {{"action": "description", "owner": "name or Unknown", "due": "ASAP|This week|Next meeting|TBD"}}
    ],
    "next_steps": ["next step 1", "next step 2"],
    "suggested_next_meeting_agenda": ["item 1", "item 2"]
  }}
}}"""

    try:
        response = await client.messages.create(
            model="claude-opus-4-6",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
            system=INSIGHT_SYSTEM_PROMPT,
        )

        text = response.content[0].text.strip()

        # Extract JSON from response
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        insights = json.loads(text)
        return insights

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Claude JSON response: {e}")
        return _placeholder_insights()
    except Exception as e:
        logger.error(f"Claude insights error: {e}")
        return _placeholder_insights()


async def answer_memory_query(question: str, sessions_context: list[dict]) -> dict:
    """
    Answer a natural-language question about the user's conversation history.
    sessions_context: list of dicts with keys: id, title, date, type, duration,
                      topics, summary, decisions, action_items, sentiment, participants.
    Returns: { answer, referenced_sessions, confidence }
    """
    if not client:
        return {"answer": "Memory query unavailable — API not configured.", "referenced_sessions": [], "confidence": 0}

    context_text = ""
    for s in sessions_context[:80]:  # cap at 80 sessions to fit context window
        context_text += f"""
---
Session: {s.get('title', 'Untitled')} [{s.get('type', '')}] on {s.get('date', 'unknown date')} ({s.get('duration_min', 0)} min)
Participants: {', '.join(s.get('participants', [])) or 'unknown'}
Topics: {', '.join(s.get('topics', [])) or 'not extracted'}
Summary: {s.get('summary', 'No summary')}
Decisions: {'; '.join(s.get('decisions', [])) or 'none recorded'}
Action Items: {'; '.join([f"{a.get('item','')} ({a.get('owner','')})" for a in s.get('action_items', [])]) or 'none'}
Sentiment: {s.get('sentiment', 'unknown')}
Session ID: {s.get('id', '')}
"""

    prompt = f"""You are the user's personal second brain. You have access to transcripts and analyses
of all their past conversations. Answer their question accurately based only on the data provided.
Be specific — cite dates, sessions, and exact details when available.
If you don't have enough data, say so honestly.

USER'S CONVERSATION HISTORY:
{context_text}

USER'S QUESTION: {question}

Return a JSON object:
{{
  "answer": "comprehensive, specific answer citing exact sessions and dates",
  "referenced_sessions": ["session_id_1", "session_id_2"],
  "confidence": 0.0-1.0,
  "follow_up_suggestions": ["related question to explore 1", "question 2"]
}}"""

    try:
        response = await client.messages.create(
            model="claude-opus-4-6",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            system="You are a personal AI memory assistant with access to the user's complete conversation history. Be precise, cite specific sessions, and give genuinely useful answers.",
        )
        text = response.content[0].text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        return json.loads(text)
    except Exception as e:
        logger.error(f"Memory query error: {e}")
        return {"answer": "Unable to process query at this time.", "referenced_sessions": [], "confidence": 0}


async def generate_longitudinal_profile(sessions_context: list[dict]) -> dict:
    """
    Generate a longitudinal EQ profile from all sessions.
    Identifies communication patterns, emotional trends, and growth areas.
    """
    if not client or not sessions_context:
        return {}

    recent = sessions_context[:30]
    context_text = "\n".join([
        f"- {s.get('date')}: {s.get('title')} | Valence: {s.get('valence', 0):.2f} | "
        f"Arousal: {s.get('arousal', 0.5):.2f} | Dominant emotion: {s.get('dominant_emotion', 'unknown')} | "
        f"Topics: {', '.join(s.get('topics', [])[:3])}"
        for s in recent
    ])

    prompt = f"""Analyze this person's communication and emotional intelligence patterns over time.

SESSION HISTORY (most recent first):
{context_text}

Return JSON:
{{
  "overall_eq_score": 0-100,
  "eq_description": "1-2 sentence EQ profile summary",
  "dominant_communication_style": "e.g. analytical, empathetic, assertive, reserved",
  "emotional_range": "e.g. wide range, emotionally consistent, tends toward positive",
  "top_strengths": ["strength 1", "strength 2", "strength 3"],
  "growth_areas": ["area 1", "area 2"],
  "emotional_trend": "improving|stable|declining",
  "trend_explanation": "why the trend is what it is",
  "recurring_patterns": ["pattern 1", "pattern 2"],
  "top_topics_of_life": ["topic 1", "topic 2", "topic 3"],
  "coaching_tip": "one personalised coaching recommendation"
}}"""

    try:
        response = await client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        return json.loads(text)
    except Exception as e:
        logger.error(f"Longitudinal profile error: {e}")
        return {}


async def generate_realtime_nudge(
    recent_transcript: str,
    recent_emotions: list,
    session_type: str,
) -> str | None:
    """
    Generate a short real-time nudge/suggestion during a session.
    Returns a 1-sentence suggestion or None.
    """
    if not client:
        return None

    try:
        top_emotions = [e.get("dominant_emotion", "") for e in recent_emotions[-3:] if e]
        prompt = f"""Based on this snippet from a {session_type}:

Transcript (last 30s): "{recent_transcript}"
Voice emotions detected: {', '.join(top_emotions)}

Give ONE concise, actionable real-time coaching tip (max 15 words).
Only if something significant warrants it — else return null.
Return either a tip string or the word "null"."""

        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        if text.lower() == "null" or not text:
            return None
        return text

    except Exception as e:
        logger.error(f"Realtime nudge error: {e}")
        return None


def _find_incongruences(segments: list, emotion_timeline: list) -> list:
    """Detect places where text sentiment contradicts voice emotion."""
    incongruences = []

    # Simple heuristic: find segments where text has positive words
    # but voice shows negative emotions (or vice versa)
    positive_words = {"great", "good", "excellent", "perfect", "happy", "love", "agree", "absolutely", "yes"}
    negative_voice = {"Anger", "Disgust", "Contempt", "Sadness", "Fear", "Distress"}
    negative_words = {"problem", "issue", "concern", "worried", "bad", "wrong", "difficult", "no", "not"}
    positive_voice = {"Joy", "Enthusiasm", "Excitement", "Satisfaction", "Contentment"}

    for segment in segments[:20]:
        text_lower = segment.get("text", "").lower()
        speaker = segment.get("speaker", "Unknown")
        start_time = segment.get("start", 0)

        # Find closest emotion data
        closest_emotion = _find_emotion_at_time(emotion_timeline, start_time)
        if not closest_emotion:
            continue

        dominant_voice_emotion = closest_emotion.get("dominant_emotion", "")
        text_words = set(text_lower.split())

        has_positive_text = bool(text_words & positive_words)
        has_negative_text = bool(text_words & negative_words)
        has_positive_voice = dominant_voice_emotion in positive_voice
        has_negative_voice = dominant_voice_emotion in negative_voice

        if has_positive_text and has_negative_voice:
            incongruences.append({
                "speaker": speaker,
                "timestamp": start_time,
                "words_said": segment.get("text", "")[:100],
                "voice_emotion": dominant_voice_emotion,
                "type": "positive_words_negative_voice",
            })
        elif has_negative_text and has_positive_voice:
            incongruences.append({
                "speaker": speaker,
                "timestamp": start_time,
                "words_said": segment.get("text", "")[:100],
                "voice_emotion": dominant_voice_emotion,
                "type": "negative_words_positive_voice",
            })

    return incongruences[:5]  # Return top 5


def _find_emotion_at_time(emotion_timeline: list, timestamp: float) -> dict | None:
    """Find the closest emotion data point to a given timestamp."""
    if not emotion_timeline:
        return None
    closest = min(emotion_timeline, key=lambda e: abs(e.get("timestamp", 0) - timestamp), default=None)
    return closest


def _placeholder_insights() -> dict:
    return {
        "summary": "Session analysis unavailable — API key not configured.",
        "key_topics": [],
        "action_items": [],
        "decisions_made": [],
        "eq_report": {
            "overall_tone": "Unknown",
            "emotional_arc": "Unknown",
            "stress_indicators": [],
            "engagement_level": "unknown",
            "engagement_reason": "",
            "collaboration_quality": "",
            "tension_moments": [],
            "positive_moments": [],
        },
        "incongruence_analysis": {"detected": False, "examples": [], "overall_interpretation": ""},
        "speaker_profiles": [],
        "recommendations": [],
        "follow_up_questions": [],
        "sentiment_overall": "neutral",
        "sentiment_score": 0.0,
    }
