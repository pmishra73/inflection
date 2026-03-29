"""
Google Drive router — OAuth connect/disconnect + connection status.
"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, AsyncSessionLocal
from app.models.user import User
from app.utils.auth import get_current_user
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/drive", tags=["drive"])


# ── OAuth initiation ──────────────────────────────────────────────────────────

@router.get("/auth-url")
async def get_drive_auth_url(
    current_user: User = Depends(get_current_user),
):
    """Return the Google OAuth URL for the frontend to redirect to."""
    from app.services.drive_service import get_auth_url
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=501,
            detail="Google Drive integration not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env"
        )
    try:
        url = get_auth_url(current_user.id)
        return {"auth_url": url}
    except ValueError as e:
        raise HTTPException(status_code=501, detail=str(e))


# ── OAuth callback (Google redirects here) ────────────────────────────────────

@router.get("/callback")
async def drive_callback(
    code: str = Query(...),
    state: str = Query(...),   # contains user_id
    error: str = Query(None),
):
    """
    Google OAuth callback. Exchanges code for tokens, encrypts refresh token, stores in DB.
    Redirects to frontend settings page on completion.
    """
    frontend_settings = f"{settings.FRONTEND_URL}/settings"

    if error:
        logger.warning(f"Drive OAuth error for user {state}: {error}")
        return RedirectResponse(url=f"{frontend_settings}?drive=error&reason={error}")

    user_id = state
    try:
        from app.services.drive_service import exchange_code, encrypt_token, get_user_email

        # Exchange code for credentials
        token_dict = exchange_code(code)
        token_json = json.dumps(token_dict)

        # Get the Google account email
        email = get_user_email(token_json)

        # Encrypt the refresh token for storage
        encrypted_token = encrypt_token(token_json)

        # Save to DB
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                return RedirectResponse(url=f"{frontend_settings}?drive=error&reason=user_not_found")

            user.drive_refresh_token_enc = encrypted_token
            user.drive_connected = True
            user.drive_email = email
            await db.commit()

        logger.info(f"Drive connected for user {user_id} ({email})")
        return RedirectResponse(url=f"{frontend_settings}?drive=connected")

    except Exception as e:
        logger.error(f"Drive callback error for user {user_id}: {e}")
        return RedirectResponse(url=f"{frontend_settings}?drive=error&reason=exchange_failed")


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def drive_status(
    current_user: User = Depends(get_current_user),
):
    """Return whether Drive is connected for this user."""
    return {
        "connected": current_user.drive_connected,
        "email": current_user.drive_email if current_user.drive_connected else None,
        "root_folder_id": current_user.drive_root_folder_id if current_user.drive_connected else None,
        "configured": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET),
    }


# ── Disconnect ────────────────────────────────────────────────────────────────

@router.delete("/disconnect")
async def drive_disconnect(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Disconnect Drive. Revokes the token and clears stored credentials.
    Recording metadata (drive_file_id) is kept so it can be re-linked if user reconnects.
    """
    if not current_user.drive_connected:
        return {"message": "Drive was not connected"}

    try:
        if current_user.drive_refresh_token_enc:
            from app.services.drive_service import decrypt_token, revoke_token
            token_json = decrypt_token(current_user.drive_refresh_token_enc)
            revoke_token(token_json)
    except Exception as e:
        logger.warning(f"Token revocation failed (continuing disconnect): {e}")

    current_user.drive_refresh_token_enc = None
    current_user.drive_connected = False
    # Keep drive_email and drive_root_folder_id so reconnect is seamless
    await db.commit()

    return {"message": "Google Drive disconnected successfully"}
