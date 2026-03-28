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
  "sentiment_score": -1.0 to 1.0
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
