"""
ElevenLabs service — high-quality speech-to-text via Scribe API.
Used for final session transcription (higher accuracy than real-time Deepgram).
Also handles TTS for insight summaries.
"""
import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

# Default voice for insight narration
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel — clear, professional


async def transcribe_full_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> dict:
    """
    Transcribe complete session audio using ElevenLabs Scribe.
    Returns high-quality transcript with word-level timestamps and speaker diarization.
    """
    if not settings.ELEVENLABS_API_KEY:
        logger.warning("ElevenLabs API key not set — skipping Scribe transcription")
        return {"transcript": "", "words": [], "language": "en", "language_probability": 0.0}

    ext_map = {
        "audio/webm": "webm",
        "audio/ogg": "ogg",
        "audio/wav": "wav",
        "audio/mp4": "m4a",
        "audio/mpeg": "mp3",
    }
    ext = ext_map.get(mime_type, "webm")
    filename = f"session.{ext}"

    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY}

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            files = {"file": (filename, audio_bytes, mime_type)}
            data = {
                "model_id": "scribe_v1",
                "diarize": "true",
                "timestamps_granularity": "word",
                "tag_audio_events": "true",
            }
            resp = await client.post(
                ELEVENLABS_STT_URL,
                headers=headers,
                files=files,
                data=data,
            )
            resp.raise_for_status()
            result = resp.json()

        return _parse_elevenlabs_response(result)

    except httpx.HTTPStatusError as e:
        logger.error(f"ElevenLabs STT error: {e.response.status_code} — {e.response.text[:500]}")
        return {"transcript": "", "words": [], "language": "en", "language_probability": 0.0}
    except Exception as e:
        logger.error(f"ElevenLabs transcription error: {e}")
        return {"transcript": "", "words": [], "language": "en", "language_probability": 0.0}


def _parse_elevenlabs_response(data: dict) -> dict:
    """Parse ElevenLabs Scribe response."""
    result = {
        "transcript": data.get("text", ""),
        "language": data.get("language_code", "en"),
        "language_probability": data.get("language_probability", 0.0),
        "words": [],
        "segments": [],
    }

    words = data.get("words", [])
    result["words"] = [
        {
            "text": w.get("text", ""),
            "type": w.get("type", "word"),  # word | spacing | audio_event
            "start": w.get("start", 0),
            "end": w.get("end", 0),
            "speaker_id": w.get("speaker_id"),
        }
        for w in words
    ]

    # Build speaker segments
    current_segment = None
    for word in result["words"]:
        if word["type"] != "word":
            continue
        speaker = word.get("speaker_id", "speaker_0")
        if current_segment is None or current_segment["speaker_id"] != speaker:
            if current_segment:
                result["segments"].append(current_segment)
            current_segment = {
                "speaker_id": speaker,
                "speaker": _format_speaker(speaker),
                "text": word["text"],
                "start": word["start"],
                "end": word["end"],
            }
        else:
            current_segment["text"] += " " + word["text"]
            current_segment["end"] = word["end"]

    if current_segment:
        result["segments"].append(current_segment)

    return result


def _format_speaker(speaker_id: str) -> str:
    """Convert speaker_0 → Speaker 1."""
    try:
        num = int(speaker_id.split("_")[-1]) + 1
        return f"Speaker {num}"
    except (ValueError, IndexError):
        return speaker_id


async def generate_tts_summary(text: str, voice_id: str = DEFAULT_VOICE_ID) -> bytes | None:
    """
    Generate audio summary of insights using ElevenLabs TTS.
    Returns audio bytes (mp3) or None on failure.
    """
    if not settings.ELEVENLABS_API_KEY:
        logger.warning("ElevenLabs API key not set — skipping TTS")
        return None

    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.8,
            "style": 0.2,
            "use_speaker_boost": True,
        },
    }

    try:
        url = ELEVENLABS_TTS_URL.format(voice_id=voice_id)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers, params={"output_format": "mp3_44100_128"})
            resp.raise_for_status()
            return resp.content
    except Exception as e:
        logger.error(f"ElevenLabs TTS error: {e}")
        return None
