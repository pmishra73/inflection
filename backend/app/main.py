from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import logging

from app.config import settings
from app.database import init_db
from app.routers import auth, sessions, ws
from app.routers import memory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database...")
    await init_db()
    logger.info("Inflection backend started")
    yield
    logger.info("Inflection backend shutting down")


app = FastAPI(
    title="Inflection API",
    description="AI-powered emotion intelligence platform for meetings and conversations",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(memory.router, prefix="/api/v1")
app.include_router(ws.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
