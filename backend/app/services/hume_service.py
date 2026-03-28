"""
Hume AI service — prosodic emotion analysis from audio.
Analyzes HOW something is said: pitch, energy, tone → 48+ emotional expressions.
"""
import asyncio
import base64
import logging
import time
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

HUME_BATCH_URL = "https://api.hume.ai/v0/batch/jobs"
HUME_INFERENCE_URL = "https://api.hume.ai/v0/batch/jobs/{job_id}/predictions"

# Top emotions we care most about for the UI
PRIMARY_EMOTIONS = [
    "Admiration", "Adoration", "Aesthetic Appreciation", "Amusement", "Anger",
    "Anxiety", "Awe", "Awkwardness", "Boredom", "Calmness", "Concentration",
    "Confusion", "Contemplation", "Contempt", "Contentment", "Craving",
    "Determination", "Disappointment", "Disgust", "Distress", "Doubt",
    "Ecstasy", "Embarrassment", "Empathic Pain", "Enthusiasm", "Entrancement",
    "Envy", "Excitement", "Fear", "Guilt", "Horror", "Interest", "Joy",
    "Love", "Nostalgia", "Pain", "Pride", "Realization", "Relief", "Sadness",
    "Satisfaction", "Shame", "Surprise (negative)", "Surprise (positive)",
    "Sympathy", "Tiredness", "Triumph",
]

# Emotion categories for grouping
EMOTION_CATEGORIES = {
    "positive": ["Joy", "Excitement", "Enthusiasm", "Satisfaction", "Contentment", "Amusement", "Pride", "Triumph", "Love", "Admiration"],
    "negative": ["Anger", "Sadness", "Fear", "Disgust", "Contempt", "Distress", "Guilt", "Shame", "Horror", "Disappointment"],
    "neutral": ["Calmness", "Concentration", "Contemplation", "Interest", "Realization", "Confusion"],
    "social": ["Empathic Pain", "Sympathy", "Embarrassment", "Envy", "Love", "Adoration"],
}


async def analyze_audio_emotion(audio_bytes: bytes, mime_type: str = "audio/webm") -> dict:
    """
    Submit audio to Hume AI and return emotion predictions.
    Returns top emotions with scores and the dominant emotion.
    """
    if not settings.HUME_API_KEY:
        logger.warning("Hume API key not set — returning empty emotion data")
        return _empty_emotion_result()

    headers = {"X-Hume-Api-Key": settings.HUME_API_KEY}

    # Encode audio as base64 for the request
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

    # Determine file extension from mime type
    ext_map = {
        "audio/webm": "webm",
        "audio/ogg": "ogg",
        "audio/wav": "wav",
        "audio/mp4": "mp4",
        "audio/mpeg": "mp3",
    }
    ext = ext_map.get(mime_type, "webm")

    payload = {
        "models": {
            "prosody": {
                "granularity": "utterance",
                "identify_speakers": True,
            }
        },
        "raw_text": [],
        "urls": [],
        "files": [
            {
                "filename": f"chunk.{ext}",
                "content_type": mime_type,
                "data": audio_b64,
            }
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Submit job
            resp = await client.post(HUME_BATCH_URL, json=payload, headers=headers)
            resp.raise_for_status()
            job_data = resp.json()
            job_id = job_data.get("job_id")

            if not job_id:
                return _empty_emotion_result()

            # Poll for results (max 30 seconds)
            predictions = await _poll_hume_job(client, job_id, headers, max_wait=30)
            return _parse_hume_predictions(predictions)

    except httpx.HTTPStatusError as e:
        logger.error(f"Hume HTTP error: {e.response.status_code} — {e.response.text[:500]}")
        return _empty_emotion_result()
    except Exception as e:
        logger.error(f"Hume emotion analysis error: {e}")
        return _empty_emotion_result()


async def _poll_hume_job(client: httpx.AsyncClient, job_id: str, headers: dict, max_wait: int = 30) -> list:
    """Poll Hume job until complete, return predictions."""
    poll_url = HUME_INFERENCE_URL.format(job_id=job_id)
    deadline = time.time() + max_wait

    while time.time() < deadline:
        await asyncio.sleep(1.5)
        try:
            resp = await client.get(poll_url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 202:
                # Still processing
                continue
        except Exception:
            continue

    logger.warning(f"Hume job {job_id} timed out after {max_wait}s")
    return []


def _parse_hume_predictions(predictions: list) -> dict:
    """Parse Hume predictions into our emotion format."""
    result = _empty_emotion_result()

    if not predictions:
        return result

    try:
        # Navigate prediction structure
        for prediction in predictions:
            file_preds = prediction.get("results", {}).get("predictions", [])
            for file_pred in file_preds:
                models = file_pred.get("models", {})
                prosody = models.get("prosody", {})
                grouped_preds = prosody.get("grouped_predictions", [])

                for group in grouped_preds:
                    speaker_id = group.get("id", "unknown")
                    utterances = group.get("predictions", [])

                    for utt in utterances:
                        emotions = utt.get("emotions", [])
                        time_start = utt.get("time", {}).get("begin", 0)
                        time_end = utt.get("time", {}).get("end", 0)

                        # Build emotion scores dict
                        emotion_scores = {e["name"]: round(e["score"], 4) for e in emotions}

                        # Top 5 emotions
                        top_emotions = sorted(emotions, key=lambda x: x["score"], reverse=True)[:5]

                        result["utterances"].append({
                            "speaker_id": speaker_id,
                            "time_start": time_start,
                            "time_end": time_end,
                            "emotions": emotion_scores,
                            "top_emotions": [{"name": e["name"], "score": round(e["score"], 4)} for e in top_emotions],
                            "dominant_emotion": top_emotions[0]["name"] if top_emotions else "Neutral",
                        })

        # Aggregate across all utterances
        if result["utterances"]:
            all_scores: dict = {}
            for utt in result["utterances"]:
                for name, score in utt["emotions"].items():
                    if name not in all_scores:
                        all_scores[name] = []
                    all_scores[name].append(score)

            result["aggregate"] = {
                name: round(sum(scores) / len(scores), 4)
                for name, scores in all_scores.items()
            }

            # Top 10 overall
            sorted_agg = sorted(result["aggregate"].items(), key=lambda x: x[1], reverse=True)[:10]
            result["top_emotions"] = [{"name": n, "score": s} for n, s in sorted_agg]
            result["dominant_emotion"] = sorted_agg[0][0] if sorted_agg else "Neutral"

            # Valence/arousal (approximate from emotion scores)
            result["valence"] = _compute_valence(result["aggregate"])
            result["arousal"] = _compute_arousal(result["aggregate"])

    except Exception as e:
        logger.error(f"Error parsing Hume predictions: {e}")

    return result


def _compute_valence(scores: dict) -> float:
    """Estimate emotional valence (-1 to +1) from emotion scores."""
    positive = sum(scores.get(e, 0) for e in EMOTION_CATEGORIES["positive"])
    negative = sum(scores.get(e, 0) for e in EMOTION_CATEGORIES["negative"])
    total = positive + negative
    if total == 0:
        return 0.0
    return round((positive - negative) / total, 3)


def _compute_arousal(scores: dict) -> float:
    """Estimate arousal (0 to 1) — high energy emotions vs low energy."""
    high_arousal = ["Excitement", "Anger", "Fear", "Enthusiasm", "Triumph", "Horror", "Ecstasy"]
    low_arousal = ["Calmness", "Contentment", "Boredom", "Tiredness", "Sadness", "Nostalgia"]
    high = sum(scores.get(e, 0) for e in high_arousal)
    low = sum(scores.get(e, 0) for e in low_arousal)
    total = high + low
    if total == 0:
        return 0.5
    return round(high / total, 3)


def _empty_emotion_result() -> dict:
    return {
        "utterances": [],
        "aggregate": {},
        "top_emotions": [],
        "dominant_emotion": "Neutral",
        "valence": 0.0,
        "arousal": 0.5,
    }
