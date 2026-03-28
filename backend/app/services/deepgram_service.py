"""
Deepgram service — real-time streaming transcription with speaker diarization.
Used for the live WebSocket pipeline to get low-latency transcripts per audio chunk.
"""
import asyncio
import json
import logging
from typing import Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"
DEEPGRAM_REST_URL = "https://api.deepgram.com/v1/listen"


async def transcribe_audio_chunk(audio_bytes: bytes, mime_type: str = "audio/webm") -> dict:
    """
    Transcribe a single audio chunk using Deepgram's REST API.
    Returns structured transcript with speaker diarization and word timings.
    """
    if not settings.DEEPGRAM_API_KEY:
        logger.warning("Deepgram API key not set — returning empty transcript")
        return {"transcript": "", "segments": [], "words": []}

    params = {
        "model": "nova-2",
        "smart_format": "true",
        "diarize": "true",
        "punctuate": "true",
        "utterances": "true",
        "sentiment": "true",
        "language": "en-US",
    }

    headers = {
        "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
        "Content-Type": mime_type,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                DEEPGRAM_REST_URL,
                params=params,
                headers=headers,
                content=audio_bytes,
            )
            resp.raise_for_status()
            data = resp.json()

        return _parse_deepgram_response(data)

    except httpx.HTTPStatusError as e:
        logger.error(f"Deepgram HTTP error: {e.response.status_code} — {e.response.text}")
        return {"transcript": "", "segments": [], "words": []}
    except Exception as e:
        logger.error(f"Deepgram transcription error: {e}")
        return {"transcript": "", "segments": [], "words": []}


def _parse_deepgram_response(data: dict) -> dict:
    """Parse Deepgram response into a clean structure."""
    result = {"transcript": "", "segments": [], "words": [], "sentiment": None}

    try:
        channels = data.get("results", {}).get("channels", [])
        if not channels:
            return result

        alternatives = channels[0].get("alternatives", [])
        if not alternatives:
            return result

        alt = alternatives[0]
        result["transcript"] = alt.get("transcript", "")

        # Word-level data with speaker info
        words = alt.get("words", [])
        result["words"] = [
            {
                "word": w.get("word", ""),
                "start": w.get("start", 0),
                "end": w.get("end", 0),
                "confidence": w.get("confidence", 0),
                "speaker": w.get("speaker", 0),
                "speaker_confidence": w.get("speaker_confidence", 0),
            }
            for w in words
        ]

        # Build speaker segments from utterances
        utterances = data.get("results", {}).get("utterances", [])
        result["segments"] = [
            {
                "speaker": f"Speaker {u.get('speaker', 0) + 1}",
                "speaker_id": u.get("speaker", 0),
                "text": u.get("transcript", ""),
                "start": u.get("start", 0),
                "end": u.get("end", 0),
                "confidence": u.get("confidence", 0),
                "sentiment": u.get("sentiment", None),
                "sentiment_score": u.get("sentiment_score", None),
            }
            for u in utterances
        ]

        # Overall sentiment
        sentiments = data.get("results", {}).get("sentiments", {})
        if sentiments:
            overall = sentiments.get("average", {})
            result["sentiment"] = overall.get("sentiment")
            result["sentiment_score"] = overall.get("sentiment_score")

    except Exception as e:
        logger.error(f"Error parsing Deepgram response: {e}")

    return result


async def get_deepgram_streaming_config() -> dict:
    """Return config params for Deepgram streaming WebSocket."""
    return {
        "model": "nova-2",
        "smart_format": True,
        "diarize": True,
        "punctuate": True,
        "interim_results": True,
        "utterance_end_ms": 1000,
        "vad_events": True,
        "language": "en-US",
    }
