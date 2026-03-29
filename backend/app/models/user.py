import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class UserPlan(str, enum.Enum):
    free = "free"
    pro = "pro"
    enterprise = "enterprise"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    plan: Mapped[UserPlan] = mapped_column(SAEnum(UserPlan), default=UserPlan.free)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Google Drive integration
    # Refresh token is AES-256-GCM encrypted before storage — key is server-side only
    drive_refresh_token_enc: Mapped[str | None] = mapped_column(String, nullable=True)
    drive_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    # ID of the root "inflection" folder in user's Drive (created once on first upload)
    drive_root_folder_id: Mapped[str | None] = mapped_column(String, nullable=True)
    drive_email: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sessions: Mapped[list["Session"]] = relationship("Session", back_populates="user", lazy="dynamic")
