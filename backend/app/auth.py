"""Firebase Admin ID-token verification for protected endpoints.

Two operating modes, controlled by the ``KINETIC_AUTH_REQUIRED`` env var:

  * ``KINETIC_AUTH_REQUIRED=true`` — every protected request must carry a
    valid ``Authorization: Bearer <ID token>`` header. Missing or invalid
    tokens return 401.
  * unset/anything-else — auth is **permissive**: a valid token is decoded
    and the UID is exposed to the route, but missing/invalid tokens are
    allowed through (with a single startup warning). This keeps local dev
    convenient while letting production lock things down by flipping one
    env var.

Service-account credentials are picked up automatically by
``firebase_admin.initialize_app()`` from one of, in order:

  1. ``FIREBASE_CREDENTIALS`` — path to a service-account JSON file.
  2. ``GOOGLE_APPLICATION_CREDENTIALS`` — same, standard Google convention.
  3. Application Default Credentials (gcloud, GCE/GKE metadata, etc.).

For local strict-auth device QA without privileged Admin credentials,
``FIREBASE_PROJECT_ID`` enables project-scoped verification against Google's
published Firebase signing certificates. This path still validates signature,
audience, issuer, expiry, and subject. It cannot mint tokens or access Admin
APIs.

If the SDK fails to initialize while ``KINETIC_AUTH_REQUIRED=true``, the
dependency raises 503 on every protected call so misconfiguration is loud
rather than silently insecure.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Optional

from fastapi import Depends, Header, HTTPException, status

_log = logging.getLogger(__name__)

_init_lock = threading.Lock()
_init_error: Optional[Exception] = None
_initialized: bool = False


def _auth_required() -> bool:
    return os.environ.get("KINETIC_AUTH_REQUIRED", "").strip().lower() == "true"


def _project_only_verification_id() -> Optional[str]:
    """Return the explicitly opted-in project-only verifier ID, if any."""
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "").strip()
    if not project_id:
        return None
    credential_path = (
        os.environ.get("FIREBASE_CREDENTIALS")
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    )
    if credential_path and os.path.isfile(credential_path):
        return None
    return project_id


def _validate_project_token_claims(claims: dict, project_id: str) -> dict:
    """Apply Firebase issuer/subject invariants after public-key validation."""
    if claims.get("iss") != f"https://securetoken.google.com/{project_id}":
        raise ValueError("Firebase ID token has an invalid issuer.")
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject or len(subject) > 128:
        raise ValueError("Firebase ID token has an invalid subject.")
    return {**claims, "uid": subject}


def _verify_project_scoped_token(token: str, project_id: str) -> dict:
    """Verify a Firebase ID token without privileged Admin credentials."""
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token

    claims = id_token.verify_firebase_token(
        token,
        Request(),
        audience=project_id,
    )
    return _validate_project_token_claims(claims, project_id)


def _ensure_admin_initialized() -> Optional[Exception]:
    """Initialize firebase_admin once, lazily. Returns init error or None."""
    global _initialized, _init_error
    if _initialized:
        return _init_error
    with _init_lock:
        if _initialized:
            return _init_error
        try:
            import firebase_admin  # noqa: WPS433 — lazy on purpose
            from firebase_admin import credentials

            if not firebase_admin._apps:  # type: ignore[attr-defined]
                cred_path = (
                    os.environ.get("FIREBASE_CREDENTIALS")
                    or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
                )
                # `isfile` (not `exists`) so a Docker-Compose-auto-created
                # directory at the bind-mount path doesn't trick us into
                # passing a non-file to credentials.Certificate.
                if cred_path and os.path.isfile(cred_path):
                    firebase_admin.initialize_app(credentials.Certificate(cred_path))
                else:
                    # Application Default Credentials path.
                    firebase_admin.initialize_app()
            _init_error = None
        except Exception as exc:  # noqa: BLE001 — surface clearly via dependency
            _init_error = exc
            if _auth_required():
                _log.error("Firebase Admin init failed (auth required): %s", exc)
            else:
                _log.warning(
                    "Firebase Admin init failed (auth permissive, allowing "
                    "requests through): %s",
                    exc,
                )
        finally:
            _initialized = True
    return _init_error


def verify_firebase_token(
    authorization: Optional[str] = Header(default=None),
) -> Optional[dict]:
    """FastAPI dependency that returns the decoded token payload (or None).

    * In **strict** mode (``KINETIC_AUTH_REQUIRED=true``):
        - Missing/invalid header → 401.
        - Admin SDK not initialized → 503.
    * In **permissive** mode (default):
        - Returns decoded token if a valid one is supplied.
        - Otherwise returns ``None`` and lets the route proceed.

    Routes can read ``request.state`` if they need the UID; for now the
    return value is enough to gate logic if/when the engine grows
    per-user state.
    """
    strict = _auth_required()

    if not authorization:
        if strict:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing Authorization header.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return None

    # Accept "Bearer <token>" (case-insensitive scheme).
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        if strict:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Authorization header format.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return None

    token = parts[1].strip()
    project_id = _project_only_verification_id()

    try:
        if project_id:
            return _verify_project_scoped_token(token, project_id)

        init_err = _ensure_admin_initialized()
        if init_err is not None:
            raise init_err

        from firebase_admin import auth as fb_auth

        return fb_auth.verify_id_token(token)
    except Exception as exc:  # noqa: BLE001 — collapse to one auth failure
        if strict:
            from google.auth.exceptions import DefaultCredentialsError

            if isinstance(exc, DefaultCredentialsError):
                _log.error("Firebase Admin credentials unavailable in strict mode.")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Auth backend unavailable.",
                ) from exc
            _log.info("Token verification failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired ID token.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc
        _log.debug("Token verification failed (permissive mode): %s", exc)
        return None


# Convenience alias for route signatures.
RequireAuth = Depends(verify_firebase_token)
