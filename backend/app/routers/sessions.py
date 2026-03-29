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


@router.get("/{session_id}/audio")
async def stream_session_audio(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Download + decrypt the session's audio from Google Drive.
    Decryption key is derived server-side — never exposed to client.
    """
    from app.services.drive_service import download_encrypted_audio, decrypt_audio, decrypt_token
    import json

    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.drive_file_id:
        raise HTTPException(status_code=404, detail="No audio recording stored for this session")
    if not current_user.drive_connected or not current_user.drive_refresh_token_enc:
        raise HTTPException(status_code=403, detail="Google Drive not connected — reconnect to access recordings")

    try:
        token_json = decrypt_token(current_user.drive_refresh_token_enc)
        encrypted_bytes = download_encrypted_audio(session.drive_file_id, token_json)
        raw_audio = decrypt_audio(encrypted_bytes, current_user.id, session_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to retrieve audio: {str(e)}")

    mime = session.audio_mime_type or "audio/webm"
    return Response(content=raw_audio, media_type=mime, headers={
        "Content-Disposition": f'attachment; filename="{session.title}.webm"',
        "Content-Length": str(len(raw_audio)),
    })


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
