from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    SECRET_KEY: str = "change-me-in-production-use-32-plus-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./inflection.db"

    # AI APIs
    ANTHROPIC_API_KEY: str = ""
    DEEPGRAM_API_KEY: str = ""
    HUME_API_KEY: str = ""
    HUME_SECRET_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""

    # Google Drive OAuth (scope: drive.file — only files created by this app)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/drive/callback"

    # CORS
    FRONTEND_URL: str = "http://localhost:3000"

    # Processing
    CHUNK_DURATION_SECONDS: int = 5
    MAX_SESSION_DURATION_MINUTES: int = 180

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
