"""
Google Drive service — encrypted audio storage.

Security model:
  - Scope: drive.file — Inflection can ONLY see files it created; zero access to user's other Drive files.
  - Audio encryption: AES-256-GCM. Key = HMAC-SHA256(SECRET_KEY, user_id:session_id)[:32].
    Key never leaves the backend. The encrypted .enc file is opaque to anyone without the key.
  - Token encryption: Fernet symmetric encryption using a key derived from SECRET_KEY via PBKDF2.
    Encrypted refresh token is stored in DB; raw token is never persisted.
  - Checksum: SHA-256 of raw audio stored in DB for integrity verification.

Folder layout in user's Google Drive:
  My Drive/
    inflection/
      YYYY-MM-DD/
        <session_type>/
          <session_name>.enc
"""
import hashlib
import hmac
import io
import json
import logging
import os
import base64
from datetime import datetime

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload

from app.config import settings

logger = logging.getLogger(__name__)

# Google Drive OAuth scope — ONLY files created by this app. Cannot read user's other files.
SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email", "openid"]

INFLECTION_ROOT_FOLDER = "inflection"

# ── Token encryption (for storing refresh tokens in DB) ───────────────────────

def _get_fernet() -> Fernet:
    """Derive a Fernet key from SECRET_KEY for encrypting Drive refresh tokens."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"inflection-drive-token-v1",  # fixed salt — purpose-specific
        iterations=100_000,
    )
    key_material = kdf.derive(settings.SECRET_KEY.encode("utf-8"))
    return Fernet(base64.urlsafe_b64encode(key_material))


def encrypt_token(token_json: str) -> str:
    """Encrypt a Drive refresh token for DB storage."""
    return _get_fernet().encrypt(token_json.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    """Decrypt a stored Drive refresh token."""
    return _get_fernet().decrypt(encrypted.encode()).decode()


# ── Audio encryption (AES-256-GCM) ───────────────────────────────────────────

def _derive_audio_key(user_id: str, session_id: str) -> bytes:
    """
    Derive the 256-bit AES key for a specific session's audio.
    Key = HMAC-SHA256(SECRET_KEY, "{user_id}:{session_id}")[:32]
    The key is completely determined by the server SECRET_KEY + IDs.
    It is NEVER stored anywhere — it's derived on the fly when needed.
    """
    key_material = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"{user_id}:{session_id}".encode("utf-8"),
        hashlib.sha256,
    ).digest()  # already 32 bytes
    return key_material


def encrypt_audio(audio_bytes: bytes, user_id: str, session_id: str) -> tuple[bytes, str]:
    """
    Encrypt audio with AES-256-GCM.
    Returns: (encrypted_bytes, sha256_checksum_of_raw_audio)
    Encrypted format: [12-byte random nonce][GCM ciphertext+tag]
    """
    checksum = hashlib.sha256(audio_bytes).hexdigest()

    key = _derive_audio_key(user_id, session_id)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce, recommended for GCM
    ciphertext = aesgcm.encrypt(nonce, audio_bytes, None)  # no additional data

    encrypted = nonce + ciphertext  # nonce prepended for decryption
    return encrypted, checksum


def decrypt_audio(encrypted_bytes: bytes, user_id: str, session_id: str) -> bytes:
    """
    Decrypt AES-256-GCM encrypted audio.
    Raises ValueError if decryption fails (wrong key or tampered data).
    """
    key = _derive_audio_key(user_id, session_id)
    aesgcm = AESGCM(key)
    nonce = encrypted_bytes[:12]
    ciphertext = encrypted_bytes[12:]
    return aesgcm.decrypt(nonce, ciphertext, None)


# ── OAuth flow ─────────────────────────────────────────────────────────────────

def get_auth_url(user_id: str) -> str:
    """Generate the Google OAuth consent URL. State encodes user_id for callback."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise ValueError("Google OAuth credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env")

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
            }
        },
        scopes=SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",       # get refresh token
        include_granted_scopes="true",
        prompt="consent",            # always show consent to ensure refresh token is issued
        state=user_id,               # pass user_id through state parameter
    )
    return auth_url


def exchange_code(code: str) -> dict:
    """Exchange OAuth code for credentials. Returns token dict."""
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
            }
        },
        scopes=SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    return {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or []),
    }


def _build_drive_service(token_json: str):
    """Build an authenticated Drive API service from a stored token dict."""
    token_dict = json.loads(token_json)
    creds = Credentials(
        token=token_dict.get("token"),
        refresh_token=token_dict.get("refresh_token"),
        token_uri=token_dict.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=token_dict.get("client_id"),
        client_secret=token_dict.get("client_secret"),
        scopes=token_dict.get("scopes", SCOPES),
    )
    # Auto-refresh if expired
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def get_user_email(token_json: str) -> str:
    """Fetch the Google account email for the connected user."""
    try:
        token_dict = json.loads(token_json)
        creds = Credentials(
            token=token_dict.get("token"),
            refresh_token=token_dict.get("refresh_token"),
            token_uri=token_dict.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=token_dict.get("client_id"),
            client_secret=token_dict.get("client_secret"),
        )
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
        service = build("oauth2", "v2", credentials=creds, cache_discovery=False)
        info = service.userinfo().get().execute()
        return info.get("email", "")
    except Exception as e:
        logger.warning(f"Could not fetch Drive user email: {e}")
        return ""


# ── Folder management ─────────────────────────────────────────────────────────

def _get_or_create_folder(service, name: str, parent_id: str | None = None) -> str:
    """
    Find a folder by name (under parent_id) or create it if it doesn't exist.
    Returns the folder ID.
    """
    query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"

    result = service.files().list(
        q=query,
        spaces="drive",
        fields="files(id, name)",
    ).execute()

    files = result.get("files", [])
    if files:
        return files[0]["id"]

    # Create the folder
    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    if parent_id:
        metadata["parents"] = [parent_id]

    folder = service.files().create(body=metadata, fields="id").execute()
    return folder["id"]


def _build_folder_path(service, root_folder_id: str, date_str: str, session_type: str) -> str:
    """
    Ensure inflection/<date>/<type>/ folder chain exists.
    Returns the leaf folder ID.
    """
    date_folder_id = _get_or_create_folder(service, date_str, root_folder_id)
    type_folder_id = _get_or_create_folder(service, session_type, date_folder_id)
    return type_folder_id


# ── Upload / Download ─────────────────────────────────────────────────────────

async def upload_encrypted_audio(
    encrypted_bytes: bytes,
    filename: str,
    session_type: str,
    session_date: datetime,
    token_json: str,
    root_folder_id: str | None,
) -> tuple[str, str, str]:
    """
    Upload encrypted audio to Google Drive.
    Returns: (file_id, drive_path, root_folder_id)

    Drive path format: inflection/YYYY-MM-DD/<session_type>/<filename>.enc
    """
    service = _build_drive_service(token_json)

    # Ensure root "inflection" folder exists
    actual_root_id = root_folder_id or _get_or_create_folder(service, INFLECTION_ROOT_FOLDER)

    # Build date + type subfolder
    date_str = session_date.strftime("%Y-%m-%d")
    folder_id = _build_folder_path(service, actual_root_id, date_str, session_type)

    # Upload the encrypted file
    enc_filename = filename if filename.endswith(".enc") else f"{filename}.enc"
    file_metadata = {"name": enc_filename, "parents": [folder_id]}
    media = MediaIoBaseUpload(io.BytesIO(encrypted_bytes), mimetype="application/octet-stream", resumable=False)

    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id, name",
    ).execute()

    drive_path = f"{INFLECTION_ROOT_FOLDER}/{date_str}/{session_type}/{enc_filename}"
    return file["id"], drive_path, actual_root_id


def download_encrypted_audio(file_id: str, token_json: str) -> bytes:
    """
    Download an encrypted audio file from Google Drive.
    Returns raw encrypted bytes (caller decrypts).
    """
    service = _build_drive_service(token_json)
    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue()


def revoke_token(token_json: str) -> None:
    """Revoke the Drive access token (disconnect)."""
    try:
        token_dict = json.loads(token_json)
        creds = Credentials(
            token=token_dict.get("token"),
            refresh_token=token_dict.get("refresh_token"),
            token_uri=token_dict.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=token_dict.get("client_id"),
            client_secret=token_dict.get("client_secret"),
        )
        creds.revoke(Request())
    except Exception as e:
        logger.warning(f"Token revocation failed (may already be revoked): {e}")
