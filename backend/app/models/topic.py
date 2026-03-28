"""
Topic model — tracks topics discussed across all sessions for a user.
Enables the second-brain "what have I talked about X?" feature.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)

    # Normalised lowercase topic name (e.g. "product roadmap", "hiring", "q4 goals")
    name: Mapped[str] = mapped_column(String, nullable=False)

    # How many sessions this topic has appeared in
    session_count: Mapped[int] = mapped_column(Integer, default=1)

    first_seen: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
