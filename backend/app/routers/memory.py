"""
Memory router — the second-brain layer.
Enables natural-language queries over historical sessions,
topic browsing, and longitudinal EQ profiling.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional

from app.database import get_db
from app.models.user import User
from app.models.session import Session, SessionStatus
from app.models.topic import Topic
from app.utils.auth import get_current_user
from app.services.claude_service import answer_memory_query, generate_longitudinal_profile

router = APIRouter(prefix="/memory", tags=["memory"])


class MemoryQueryRequest(BaseModel):
    question: str


# ── Natural Language Memory Query ─────────────────────────────────────────────

@router.post("/query")
async def query_memory(
    payload: MemoryQueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Answer a natural language question about the user's conversation history.
    Example: "What did I discuss about the product roadmap last month?"
    """
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # Load all completed sessions with their metadata
    result = await db.execute(
        select(Session)
        .where(Session.user_id == current_user.id, Session.status == SessionStatus.completed)
        .order_by(desc(Session.created_at))
        .limit(200)  # last 200 sessions for context
    )
    sessions = list(result.scalars().all())

    if not sessions:
        return {
            "answer": "You don't have any recorded sessions yet. Start recording conversations to build your memory bank.",
            "referenced_sessions": [],
            "confidence": 0,
            "follow_up_suggestions": [],
        }

    # Build compact context for Claude (no raw transcript — uses summaries + metadata)
    sessions_context = [
        {
            "id": s.id,
            "title": s.title,
            "type": s.session_type.value,
            "date": s.created_at.strftime("%B %d, %Y") if s.created_at else "unknown",
            "duration_min": round((s.duration_seconds or 0) / 60, 1),
            "participants": s.participants or [],
            "topics": s.topics or (s.insights or {}).get("key_topics", []),
            "summary": (s.insights or {}).get("summary", ""),
            "decisions": (s.insights or {}).get("decisions_made", []),
            "action_items": (s.insights or {}).get("action_items", []),
            "sentiment": (s.insights or {}).get("sentiment_overall", "unknown"),
            "valence": (s.emotion_summary or {}).get("valence", 0),
            "dominant_emotion": (s.emotion_summary or {}).get("dominant_emotion", "unknown"),
        }
        for s in sessions
    ]

    answer = await answer_memory_query(payload.question, sessions_context)

    # Enrich referenced sessions with display metadata
    referenced_ids = answer.get("referenced_sessions", [])
    referenced_details = []
    session_map = {s.id: s for s in sessions}
    for sid in referenced_ids:
        s = session_map.get(sid)
        if s:
            referenced_details.append({
                "id": s.id,
                "title": s.title,
                "date": s.created_at.strftime("%B %d, %Y") if s.created_at else "",
                "type": s.session_type.value,
                "duration_seconds": s.duration_seconds,
            })

    return {
        **answer,
        "referenced_sessions": referenced_details,
        "total_sessions_searched": len(sessions),
    }


# ── Topics ─────────────────────────────────────────────────────────────────────

@router.get("/topics")
async def list_topics(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all topics the user has discussed, ordered by frequency."""
    result = await db.execute(
        select(Topic)
        .where(Topic.user_id == current_user.id)
        .order_by(desc(Topic.session_count))
        .limit(limit)
    )
    topics = list(result.scalars().all())

    return [
        {
            "id": t.id,
            "name": t.name,
            "session_count": t.session_count,
            "first_seen": t.first_seen.isoformat() if t.first_seen else None,
            "last_seen": t.last_seen.isoformat() if t.last_seen else None,
        }
        for t in topics
    ]


@router.get("/topics/{topic_name}/sessions")
async def sessions_by_topic(
    topic_name: str,
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all sessions where a topic was discussed."""
    result = await db.execute(
        select(Session)
        .where(
            Session.user_id == current_user.id,
            Session.status == SessionStatus.completed,
            # JSON contains search — works in SQLite and PostgreSQL
            Session.topics.contains([topic_name.lower()]),
        )
        .order_by(desc(Session.created_at))
        .limit(limit)
    )
    sessions = list(result.scalars().all())

    return [
        {
            "id": s.id,
            "title": s.title,
            "type": s.session_type.value,
            "date": s.created_at.isoformat() if s.created_at else None,
            "duration_seconds": s.duration_seconds,
            "summary": (s.insights or {}).get("summary", ""),
            "topics": s.topics or [],
        }
        for s in sessions
    ]


# ── Longitudinal EQ Profile ────────────────────────────────────────────────────

@router.get("/profile")
async def get_eq_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the user's longitudinal emotional intelligence profile.
    Derived from all completed sessions — trends, strengths, growth areas.
    """
    result = await db.execute(
        select(Session)
        .where(Session.user_id == current_user.id, Session.status == SessionStatus.completed)
        .order_by(desc(Session.created_at))
        .limit(100)
    )
    sessions = list(result.scalars().all())

    if not sessions:
        return {"message": "No sessions yet — start recording to build your profile."}

    # Compute raw stats
    valences = [(s.emotion_summary or {}).get("valence", 0) for s in sessions if s.emotion_summary]
    arousals = [(s.emotion_summary or {}).get("arousal", 0.5) for s in sessions if s.emotion_summary]
    total_minutes = sum((s.duration_seconds or 0) for s in sessions) / 60

    # Emotion frequency across sessions
    emotion_counts: dict[str, int] = {}
    for s in sessions:
        dominant = (s.emotion_summary or {}).get("dominant_emotion")
        if dominant:
            emotion_counts[dominant] = emotion_counts.get(dominant, 0) + 1

    top_emotions = sorted(emotion_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    # Topic frequency
    topic_counts: dict[str, int] = {}
    for s in sessions:
        for t in (s.topics or []):
            topic_counts[t] = topic_counts.get(t, 0) + 1

    top_topics = sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    # Trend: compare last 10 vs previous 10 sessions by valence
    recent_10 = [s for s in sessions[:10] if s.emotion_summary]
    prev_10 = [s for s in sessions[10:20] if s.emotion_summary]
    if recent_10 and prev_10:
        avg_recent = sum((s.emotion_summary or {}).get("valence", 0) for s in recent_10) / len(recent_10)
        avg_prev = sum((s.emotion_summary or {}).get("valence", 0) for s in prev_10) / len(prev_10)
        trend = "improving" if avg_recent > avg_prev + 0.05 else ("declining" if avg_recent < avg_prev - 0.05 else "stable")
    else:
        trend = "stable"

    # Weekly activity breakdown
    sessions_by_week: dict[str, int] = {}
    for s in sessions:
        if s.created_at:
            week = s.created_at.strftime("%Y-W%U")
            sessions_by_week[week] = sessions_by_week.get(week, 0) + 1

    # Build context for Claude longitudinal profile
    sessions_context = [
        {
            "date": s.created_at.strftime("%Y-%m-%d") if s.created_at else "",
            "title": s.title,
            "type": s.session_type.value,
            "valence": (s.emotion_summary or {}).get("valence", 0),
            "arousal": (s.emotion_summary or {}).get("arousal", 0.5),
            "dominant_emotion": (s.emotion_summary or {}).get("dominant_emotion", ""),
            "topics": (s.topics or [])[:3],
        }
        for s in sessions
    ]

    ai_profile = await generate_longitudinal_profile(sessions_context)

    return {
        "stats": {
            "total_sessions": len(sessions),
            "total_minutes_recorded": round(total_minutes, 1),
            "avg_valence": round(sum(valences) / len(valences), 3) if valences else 0,
            "avg_arousal": round(sum(arousals) / len(arousals), 3) if arousals else 0.5,
            "emotional_trend": trend,
            "top_emotions": [{"name": e, "count": c} for e, c in top_emotions],
            "top_topics": [{"name": t, "count": c} for t, c in top_topics],
            "sessions_by_week": sessions_by_week,
        },
        "ai_profile": ai_profile,
        "data_coverage": {
            "oldest_session": sessions[-1].created_at.isoformat() if sessions else None,
            "newest_session": sessions[0].created_at.isoformat() if sessions else None,
            "metadata_retention": "Forever",
            "full_transcript_retention": "1 year from recording date",
        },
    }


# ── Timeline ────────────────────────────────────────────────────────────────────

@router.get("/timeline")
async def get_timeline(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    topic: Optional[str] = None,
    session_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Paginated session timeline with optional filters.
    Powers the historical browsing view.
    """
    query = select(Session).where(
        Session.user_id == current_user.id,
        Session.status == SessionStatus.completed,
    )

    if topic:
        query = query.where(Session.topics.contains([topic.lower()]))
    if session_type:
        query = query.where(Session.session_type == session_type)
    if date_from:
        try:
            query = query.where(Session.created_at >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            query = query.where(Session.created_at <= datetime.fromisoformat(date_to))
        except ValueError:
            pass

    count_result = await db.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar() or 0

    query = query.order_by(desc(Session.created_at)).limit(limit).offset(offset)
    result = await db.execute(query)
    sessions = list(result.scalars().all())

    return {
        "total": total,
        "sessions": [
            {
                "id": s.id,
                "title": s.title,
                "type": s.session_type.value,
                "date": s.created_at.isoformat() if s.created_at else None,
                "duration_seconds": s.duration_seconds,
                "participant_count": s.participant_count,
                "topics": s.topics or [],
                "summary": (s.insights or {}).get("summary", ""),
                "sentiment": (s.insights or {}).get("sentiment_overall", "neutral"),
                "dominant_emotion": (s.emotion_summary or {}).get("dominant_emotion", ""),
                "valence": (s.emotion_summary or {}).get("valence", 0),
                "full_data_expires_at": s.full_data_expires_at.isoformat() if s.full_data_expires_at else None,
                "action_items_count": len((s.insights or {}).get("action_items", [])),
                "decisions_count": len((s.insights or {}).get("decisions_made", [])),
            }
            for s in sessions
        ],
    }
