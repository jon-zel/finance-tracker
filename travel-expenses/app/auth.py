"""
Authentication: session signing, password hashing, rate limiting, and the
per-user folder name derivation (spec §2A, §3).

Nothing in this file touches trip .xlsx files — that stays in excel_io.py
so the Golden Rule (travel-expenses spec §2) has exactly one place to live.
"""
import re
import threading
import time
from dataclasses import dataclass, field

import bcrypt
from fastapi import HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

import config

# --- Email / password validation (spec §5.2/§5.3 — same rules client+server) ---

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
EMAIL_MIN_LEN = 3
EMAIL_MAX_LEN = 254
PASSWORD_MIN_LEN = 8
PASSWORD_MAX_LEN = 128
_PASSWORD_BAD_CHARS = re.compile(r"[\r\n\t\x00]")


def is_valid_email(email: str) -> bool:
    if not (EMAIL_MIN_LEN <= len(email) <= EMAIL_MAX_LEN):
        return False
    return bool(EMAIL_RE.match(email))


def is_valid_password(password: str) -> bool:
    if not (PASSWORD_MIN_LEN <= len(password) <= PASSWORD_MAX_LEN):
        return False
    return not _PASSWORD_BAD_CHARS.search(password)


# --- Per-user folder naming (spec §2A.1) ---

_FOLDER_UNSAFE_RE = re.compile(r"[^a-z0-9]")


def email_to_folder(email: str) -> str:
    """Sanitized, lowercased folder name for a user's trips. Server-side only —
    never exposed in URLs (spec §2A.1)."""
    return _FOLDER_UNSAFE_RE.sub("_", email.lower())


# --- Password hashing (spec §3.2, §4.1) ---


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # Malformed hash in config.py — never crash the login attempt over it.
        return False


MIN_FAILED_LOGIN_SECONDS = 0.25


def pad_failed_login(started_at: float) -> None:
    """Pads a failed login attempt up to a minimum latency (spec §5.4) so
    responses don't leak, via timing, whether bcrypt.checkpw ran at all
    (i.e. whether the email exists)."""
    elapsed = time.monotonic() - started_at
    remaining = MIN_FAILED_LOGIN_SECONDS - elapsed
    if remaining > 0:
        time.sleep(remaining)


# --- Session cookie signing (spec §3.2, §3.3) ---

SESSION_COOKIE_NAME = "session"
SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60  # 30 days, rolling


class SessionSigner:
    def __init__(self, secret: str):
        self._serializer = URLSafeTimedSerializer(secret, salt="travel-expenses-session")

    def sign(self, email: str) -> str:
        return self._serializer.dumps(email)

    def unsign(self, token: str) -> str | None:
        try:
            return self._serializer.loads(token, max_age=SESSION_MAX_AGE_SECONDS)
        except (BadSignature, SignatureExpired):
            return None


session_signer = SessionSigner(config.SESSION_SECRET)


def set_session_cookie(response: Response, email: str) -> None:
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session_signer.sign(email),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=config.APP_BEHIND_HTTPS,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")


def get_session_email(request: Request) -> str | None:
    """Reads and verifies the session cookie without raising — used by
    browser routes that need to redirect (rather than 401) on failure."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    email = session_signer.unsign(token)
    if email is None or email not in config.USERS:
        return None
    return email


def require_auth(request: Request, response: Response) -> str:
    """The real auth check (spec §3.2) for /api/* routes: 401 on any
    failure. Refreshes the cookie's expiry on every authenticated request
    for a rolling 30-day session."""
    email = get_session_email(request)
    if email is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    set_session_cookie(response, email)
    return email


# --- Rate limiting on /login (spec §3.2) ---

RATE_LIMIT_MAX_ATTEMPTS = 5
RATE_LIMIT_WINDOW_SECONDS = 5 * 60


@dataclass
class _Bucket:
    attempts: list = field(default_factory=list)


class LoginRateLimiter:
    """In-memory per-IP counter — fine at this scale (spec §3.2)."""

    def __init__(self) -> None:
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    def is_allowed(self, client_ip: str) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._buckets.setdefault(client_ip, _Bucket())
            bucket.attempts = [t for t in bucket.attempts if now - t < RATE_LIMIT_WINDOW_SECONDS]
            return len(bucket.attempts) < RATE_LIMIT_MAX_ATTEMPTS

    def record_attempt(self, client_ip: str) -> None:
        now = time.monotonic()
        with self._lock:
            bucket = self._buckets.setdefault(client_ip, _Bucket())
            bucket.attempts.append(now)


login_rate_limiter = LoginRateLimiter()
