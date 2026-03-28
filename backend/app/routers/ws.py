"""
WebSocket router — real-time audio streaming and processing.
Client connects, streams audio chunks, receives real-time transcript + emotion data.
"""
import asyncio
import json
import logging
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, AsyncSessionLocal
from app.models.session import Session, SessionStatus
from app.services.pipeline import process_audio_chunk, finalize_session
from app.utils.auth import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active: dict[str, WebSocket] = {}  # session_id → ws

    async def connect(self, session_id: str, ws: WebSocket):
        await ws.accept()
        self.active[session_id] = ws
        logger.info(f"WS connected: session {session_id}")

    def disconnect(self, session_id: str):
        self.active.pop(session_id, None)
        logger.info(f"WS disconnected: session {session_id}")

    async def send(self, session_id: str, data: dict):
        ws = self.active.get(session_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.error(f"WS send error for {session_id}: {e}")


manager = ConnectionManager()


@router.websocket("/session/{session_id}")
async def websocket_session(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(...),
):
    """
    WebSocket endpoint for live recording sessions.

    Protocol:
    - Client sends: binary audio chunks OR JSON control messages
    - JSON control messages: {"type": "start", "mime_type": "audio/webm"} | {"type": "end"}
    - Server sends: {"type": "chunk_result", ...} | {"type": "session_complete", ...} | {"type": "error", ...}
    """
    # Authenticate
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    # Verify session belongs to user
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Session).where(Session.id == session_id, Session.user_id == user_id)
        )
        session = result.scalar_one_or_none()

    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    await manager.connect(session_id, websocket)

    # Session state
    chunk_sequence = 0
    session_start_time = time.time()
    audio_buffer: list[bytes] = []  # accumulate full audio for ElevenLabs post-processing
    mime_type = "audio/webm"
    pending_tasks: list[asyncio.Task] = []

    try:
        await websocket.send_json({"type": "connected", "session_id": session_id})

        while True:
            try:
                message = await asyncio.wait_for(websocket.receive(), timeout=300.0)  # 5min timeout
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "timeout", "message": "Session timed out"})
                break

            # Control message (JSON text)
            if "text" in message:
                try:
                    ctrl = json.loads(message["text"])
                    msg_type = ctrl.get("type")

                    if msg_type == "start":
                        mime_type = ctrl.get("mime_type", "audio/webm")
                        await websocket.send_json({"type": "recording_started"})

                    elif msg_type == "end":
                        # Wait for all pending chunk tasks to complete
                        if pending_tasks:
                            await asyncio.gather(*pending_tasks, return_exceptions=True)
                            pending_tasks.clear()

                        # Finalize session with full audio
                        full_audio = b"".join(audio_buffer) if audio_buffer else None
                        async with AsyncSessionLocal() as db:
                            result = await finalize_session(
                                session_id=session_id,
                                full_audio_bytes=full_audio,
                                mime_type=mime_type,
                                db=db,
                            )
                        await websocket.send_json(result)
                        break

                    elif msg_type == "ping":
                        await websocket.send_json({"type": "pong"})

                except json.JSONDecodeError:
                    pass

            # Binary audio chunk
            elif "bytes" in message and message["bytes"]:
                chunk_data = message["bytes"]
                audio_buffer.append(chunk_data)

                timestamp_start = time.time() - session_start_time
                timestamp_end = timestamp_start + 5.0  # approximate

                # Process chunk asynchronously (don't block the receive loop)
                task = asyncio.create_task(
                    _process_and_send(
                        session_id=session_id,
                        chunk_sequence=chunk_sequence,
                        audio_bytes=chunk_data,
                        mime_type=mime_type,
                        timestamp_start=timestamp_start,
                        timestamp_end=timestamp_end,
                        websocket=websocket,
                    )
                )
                pending_tasks.append(task)
                chunk_sequence += 1

                # Clean up completed tasks
                pending_tasks = [t for t in pending_tasks if not t.done()]

    except WebSocketDisconnect:
        logger.info(f"Client disconnected from session {session_id}")
        # Mark session as failed if it was still recording
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Session).where(Session.id == session_id))
            session = result.scalar_one_or_none()
            if session and session.status == SessionStatus.recording:
                session.status = SessionStatus.failed
                await db.commit()

    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass

    finally:
        # Cancel any pending tasks
        for task in pending_tasks:
            task.cancel()
        manager.disconnect(session_id)


async def _process_and_send(
    session_id: str,
    chunk_sequence: int,
    audio_bytes: bytes,
    mime_type: str,
    timestamp_start: float,
    timestamp_end: float,
    websocket: WebSocket,
):
    """Process a chunk and send result back to the client."""
    try:
        async with AsyncSessionLocal() as db:
            result = await process_audio_chunk(
                session_id=session_id,
                chunk_sequence=chunk_sequence,
                audio_bytes=audio_bytes,
                mime_type=mime_type,
                timestamp_start=timestamp_start,
                timestamp_end=timestamp_end,
                db=db,
            )
        await websocket.send_json(result)
    except Exception as e:
        logger.error(f"Chunk {chunk_sequence} processing error: {e}")
        try:
            await websocket.send_json({
                "type": "chunk_error",
                "chunk_sequence": chunk_sequence,
                "message": "Processing failed for this chunk",
            })
        except Exception:
            pass
