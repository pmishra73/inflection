"""
Processing pipeline — orchestrates all AI services for a session.
Handles real-time chunk processing and post-session insight generation.
"""
import asyncio
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.session import Session, SessionChunk, SessionStatus
from app.services.deepgram_service import transcribe_audio_chunk
from app.services.hume_service import analyze_audio_emotion
from app.services.elevenlabs_service import transcribe_full_audio
from app.services.claude_service import generate_session_insights, generate_realtime_nudge

logger = logging.getLogger(__name__)


async def process_audio_chunk(
    session_id: str,
    chunk_sequence: int,
    audio_bytes: bytes,
    mime_type: str,
    timestamp_start: float,
    timestamp_end: float,
    db: AsyncSession,
) -> dict:
    """
    Process a single audio chunk through the full pipeline:
    1. Transcription (Deepgram — fast, real-time)
    2. Emotion analysis (Hume AI — prosodic)
    3. Save chunk to DB
    4. Return combined result for frontend
    """
    # Run transcription and emotion analysis in parallel
    transcript_task = asyncio.create_task(
        transcribe_audio_chunk(audio_bytes, mime_type)
    )
    emotion_task = asyncio.create_task(
        analyze_audio_emotion(audio_bytes, mime_type)
    )

    transcript_result, emotion_result = await asyncio.gather(
        transcript_task, emotion_task, return_exceptions=True
    )

    # Handle exceptions gracefully
    if isinstance(transcript_result, Exception):
        logger.error(f"Transcription failed for chunk {chunk_sequence}: {transcript_result}")
        transcript_result = {"transcript": "", "segments": [], "words": []}

    if isinstance(emotion_result, Exception):
        logger.error(f"Emotion analysis failed for chunk {chunk_sequence}: {emotion_result}")
        emotion_result = {"utterances": [], "aggregate": {}, "top_emotions": [], "dominant_emotion": "Neutral"}

    # Build emotion timeline entry
    timeline_entry = {
        "timestamp": timestamp_start,
        "timestamp_end": timestamp_end,
        "chunk_sequence": chunk_sequence,
        "dominant_emotion": emotion_result.get("dominant_emotion", "Neutral"),
        "top_emotions": emotion_result.get("top_emotions", []),
        "valence": emotion_result.get("valence", 0.0),
        "arousal": emotion_result.get("arousal", 0.5),
        "transcript_preview": transcript_result.get("transcript", "")[:100],
    }

    # Save chunk to database
    chunk = SessionChunk(
        session_id=session_id,
        sequence=chunk_sequence,
        transcript=transcript_result.get("transcript", ""),
        transcript_segments=transcript_result.get("segments", []),
        emotions=emotion_result,
        sentiment=transcript_result.get("sentiment"),
        sentiment_score=transcript_result.get("sentiment_score"),
        timestamp_start=timestamp_start,
        timestamp_end=timestamp_end,
    )
    db.add(chunk)
    await db.commit()

    # Build real-time response for WebSocket client
    return {
        "type": "chunk_result",
        "chunk_sequence": chunk_sequence,
        "timestamp_start": timestamp_start,
        "timestamp_end": timestamp_end,
        "transcript": transcript_result.get("transcript", ""),
        "segments": transcript_result.get("segments", []),
        "emotion": {
            "dominant": emotion_result.get("dominant_emotion", "Neutral"),
            "top_emotions": emotion_result.get("top_emotions", [])[:5],
            "valence": emotion_result.get("valence", 0.0),
            "arousal": emotion_result.get("arousal", 0.5),
        },
        "sentiment": transcript_result.get("sentiment"),
    }


async def finalize_session(
    session_id: str,
    full_audio_bytes: bytes | None,
    mime_type: str,
    db: AsyncSession,
) -> dict:
    """
    Finalize a session:
    1. Optionally re-transcribe full audio with ElevenLabs (higher quality)
    2. Compile emotion timeline from all chunks
    3. Generate Claude insights
    4. Update session record
    """
    # Load session and all chunks
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise ValueError(f"Session {session_id} not found")

    session.status = SessionStatus.processing
    await db.commit()

    # Load all chunks ordered by sequence
    chunks_result = await db.execute(
        select(SessionChunk)
        .where(SessionChunk.session_id == session_id)
        .order_by(SessionChunk.sequence)
    )
    chunks = list(chunks_result.scalars().all())

    # Compile transcript from chunks (or re-transcribe with ElevenLabs)
    if full_audio_bytes and len(full_audio_bytes) > 1000:
        elevenlabs_result = await transcribe_full_audio(full_audio_bytes, mime_type)
        if elevenlabs_result.get("transcript"):
            full_transcript = elevenlabs_result["transcript"]
            transcript_segments = elevenlabs_result.get("segments", [])
        else:
            full_transcript, transcript_segments = _compile_transcript(chunks)
    else:
        full_transcript, transcript_segments = _compile_transcript(chunks)

    # Compile emotion timeline
    emotion_timeline = _compile_emotion_timeline(chunks)

    # Compute emotion summary
    emotion_summary = _compute_emotion_summary(chunks, emotion_timeline)

    # Count participants
    speakers = set()
    for seg in transcript_segments:
        sp = seg.get("speaker") or seg.get("speaker_id")
        if sp:
            speakers.add(sp)
    participant_count = max(1, len(speakers))

    # Calculate duration
    duration = 0
    if session.started_at:
        duration = int((datetime.utcnow() - session.started_at).total_seconds())

    # Generate Claude insights
    insights = await generate_session_insights(
        transcript=full_transcript,
        transcript_segments=transcript_segments,
        emotion_timeline=emotion_timeline,
        emotion_summary=emotion_summary,
        session_type=session.session_type.value,
        duration_seconds=duration,
    )

    # Update session
    session.status = SessionStatus.completed
    session.ended_at = datetime.utcnow()
    session.duration_seconds = duration
    session.full_transcript = full_transcript
    session.transcript_segments = transcript_segments
    session.emotion_timeline = emotion_timeline
    session.emotion_summary = emotion_summary
    session.insights = insights
    session.participant_count = participant_count
    session.participants = list(speakers)

    await db.commit()
    await db.refresh(session)

    return {
        "type": "session_complete",
        "session_id": session_id,
        "duration_seconds": duration,
        "participant_count": participant_count,
        "insights_preview": insights.get("summary", ""),
        "dominant_emotion": emotion_summary.get("dominant_emotion", "Neutral"),
    }


def _compile_transcript(chunks: list) -> tuple[str, list]:
    """Compile full transcript from chunks."""
    all_text_parts = []
    all_segments = []

    for chunk in chunks:
        if chunk.transcript:
            all_text_parts.append(chunk.transcript)
        if chunk.transcript_segments:
            # Offset timestamps
            for seg in chunk.transcript_segments:
                adjusted_seg = dict(seg)
                adjusted_seg["start"] = seg.get("start", 0) + chunk.timestamp_start
                adjusted_seg["end"] = seg.get("end", 0) + chunk.timestamp_start
                all_segments.append(adjusted_seg)

    return " ".join(all_text_parts), all_segments


def _compile_emotion_timeline(chunks: list) -> list:
    """Build emotion timeline from all chunks."""
    timeline = []
    for chunk in chunks:
        if not chunk.emotions:
            continue
        emotions = chunk.emotions
        entry = {
            "timestamp": chunk.timestamp_start,
            "timestamp_end": chunk.timestamp_end,
            "chunk_sequence": chunk.sequence,
            "dominant_emotion": emotions.get("dominant_emotion", "Neutral"),
            "top_emotions": emotions.get("top_emotions", [])[:5],
            "valence": emotions.get("valence", 0.0),
            "arousal": emotions.get("arousal", 0.5),
            "aggregate": emotions.get("aggregate", {}),
        }
        timeline.append(entry)
    return timeline


def _compute_emotion_summary(chunks: list, timeline: list) -> dict:
    """Aggregate emotion data into a session-level summary."""
    if not chunks:
        return {"dominant_emotion": "Neutral", "top_emotions": [], "valence": 0.0, "arousal": 0.5}

    # Aggregate all emotion scores
    all_scores: dict = {}
    valences = []
    arousals = []

    for chunk in chunks:
        if not chunk.emotions:
            continue
        aggregate = chunk.emotions.get("aggregate", {})
        for name, score in aggregate.items():
            if name not in all_scores:
                all_scores[name] = []
            all_scores[name].append(score)
        valences.append(chunk.emotions.get("valence", 0.0))
        arousals.append(chunk.emotions.get("arousal", 0.5))

    if not all_scores:
        return {"dominant_emotion": "Neutral", "top_emotions": [], "valence": 0.0, "arousal": 0.5}

    avg_scores = {name: sum(scores) / len(scores) for name, scores in all_scores.items()}
    sorted_emotions = sorted(avg_scores.items(), key=lambda x: x[1], reverse=True)

    # Emotional arc (simplified: beginning vs end valence)
    if len(valences) >= 4:
        first_third = valences[: len(valences) // 3]
        last_third = valences[-len(valences) // 3 :]
        avg_start = sum(first_third) / len(first_third)
        avg_end = sum(last_third) / len(last_third)
        if avg_end > avg_start + 0.1:
            arc = "improving"
        elif avg_end < avg_start - 0.1:
            arc = "declining"
        else:
            arc = "stable"
    else:
        arc = "stable"

    return {
        "dominant_emotion": sorted_emotions[0][0] if sorted_emotions else "Neutral",
        "top_emotions": [{"name": n, "score": round(s, 4)} for n, s in sorted_emotions[:10]],
        "average_valence": round(sum(valences) / len(valences), 3) if valences else 0.0,
        "average_arousal": round(sum(arousals) / len(arousals), 3) if arousals else 0.5,
        "valence": round(sum(valences) / len(valences), 3) if valences else 0.0,
        "arousal": round(sum(arousals) / len(arousals), 3) if arousals else 0.5,
        "emotional_arc": arc,
        "all_scores": {n: round(s, 4) for n, s in sorted_emotions[:20]},
    }
