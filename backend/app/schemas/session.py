from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any
from app.models.session import SessionType, SessionStatus


class SessionCreate(BaseModel):
    title: str = "Untitled Session"
    session_type: SessionType = SessionType.meeting


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[SessionStatus] = None


class SessionResponse(BaseModel):
    id: str
    user_id: str
    title: str
    session_type: SessionType
    status: SessionStatus
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    transcript_segments: Optional[list]
    full_transcript: Optional[str]
    emotion_timeline: Optional[list]
    emotion_summary: Optional[dict]
    insights: Optional[dict]
    participant_count: int
    participants: Optional[list]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SessionListItem(BaseModel):
    id: str
    title: str
    session_type: SessionType
    status: SessionStatus
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    participant_count: int
    emotion_summary: Optional[dict]
    insights: Optional[dict]
    created_at: datetime

    class Config:
        from_attributes = True


class InsightsResponse(BaseModel):
    session_id: str
    insights: dict
    emotion_summary: dict
