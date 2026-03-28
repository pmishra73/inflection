from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.session import Session, SessionStatus
from app.schemas.session import SessionCreate, SessionUpdate, SessionResponse, SessionListItem
from app.utils.auth import get_current_user

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    payload: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = Session(
        user_id=current_user.id,
        title=payload.title,
        session_type=payload.session_type,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("", response_model=list[SessionListItem])
async def list_sessions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[SessionStatus] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Session).where(Session.user_id == current_user.id)
    if status:
        query = query.where(Session.status == status)
    query = query.order_by(desc(Session.created_at)).limit(limit).offset(offset)

    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    payload: SessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if payload.title is not None:
        session.title = payload.title
    if payload.status is not None:
        session.status = payload.status

    await db.commit()
    await db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.delete(session)
    await db.commit()
    return Response(status_code=204)


@router.get("/{session_id}/audio-summary")
async def get_audio_summary(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return ElevenLabs TTS summary of insights as audio."""
    from app.services.elevenlabs_service import generate_tts_summary

    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    insights = session.insights or {}
    summary = insights.get("summary", "Session insights not yet available.")

    if not summary:
        raise HTTPException(status_code=404, detail="No insights available")

    audio_bytes = await generate_tts_summary(summary)
    if not audio_bytes:
        raise HTTPException(status_code=503, detail="TTS service unavailable")

    return Response(content=audio_bytes, media_type="audio/mpeg")
