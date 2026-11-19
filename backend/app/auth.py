"""Inicio de sesión: hash de contraseñas, sesiones con token, límite de intentos y usuario inicial.

Solo usa la biblioteca estándar. Las contraseñas se guardan con scrypt y sal aleatoria; de la
sesión solo se guarda el SHA-256 del token, que viaja en una cookie ``HttpOnly``.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.storage.models import AppUser, AuthSession

SESSION_COOKIE = "nutriruta_session"
MIN_PASSWORD_LENGTH = 8

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_LEN = 32


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_LEN,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.b64decode(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=_SCRYPT_LEN,
        )
        return hmac.compare_digest(digest, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False


# Hash de relleno: se verifica si el usuario no existe, para no revelarlo por el tiempo.
_DUMMY_HASH = hash_password("relleno-sin-usuario")


def utcnow() -> datetime:
    return datetime.now(UTC)


def _aware(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


class LoginThrottle:
    """Bloquea un usuario unos segundos tras varios intentos fallidos seguidos."""

    def __init__(self) -> None:
        self._failures: dict[str, int] = {}
        self._locked_until: dict[str, float] = {}

    @staticmethod
    def _clock() -> float:
        return time.monotonic()

    def remaining(self, key: str) -> int:
        until = self._locked_until.get(key)
        if until is None:
            return 0
        left = until - self._clock()
        if left <= 0:
            self._locked_until.pop(key, None)
            self._failures.pop(key, None)
            return 0
        return int(left) + 1

    def failed(self, key: str, max_attempts: int, lock_seconds: float) -> None:
        count = self._failures.get(key, 0) + 1
        self._failures[key] = count
        if count >= max_attempts:
            self._locked_until[key] = self._clock() + lock_seconds

    def succeeded(self, key: str) -> None:
        self._failures.pop(key, None)
        self._locked_until.pop(key, None)

    def reset(self) -> None:
        self._failures.clear()
        self._locked_until.clear()


throttle = LoginThrottle()


def normalize_username(username: str) -> str:
    return username.strip().lower()


def get_user(session: Session, username: str) -> AppUser | None:
    return session.scalar(select(AppUser).where(AppUser.username == normalize_username(username)))


def authenticate(session: Session, username: str, password: str) -> AppUser | None:
    user = get_user(session, username)
    if user is None:
        verify_password(password, _DUMMY_HASH)
        return None
    if not verify_password(password, user.password_hash) or not user.is_active:
        return None
    return user


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(session: Session, user: AppUser, hours: float) -> str:
    now = utcnow()
    session.execute(delete(AuthSession).where(AuthSession.expires_at < now))
    token = secrets.token_urlsafe(32)
    session.add(
        AuthSession(
            token_hash=_digest(token), user_id=user.id, expires_at=now + timedelta(hours=hours)
        )
    )
    user.last_login_at = now
    session.flush()
    return token


def user_for_token(session: Session, token: str | None) -> AppUser | None:
    if not token:
        return None
    row = session.get(AuthSession, _digest(token))
    if row is None or _aware(row.expires_at) < utcnow():
        return None
    user = session.get(AppUser, row.user_id)
    return user if user is not None and user.is_active else None


def revoke_session(session: Session, token: str | None) -> None:
    if token:
        session.execute(delete(AuthSession).where(AuthSession.token_hash == _digest(token)))


def add_user(session: Session, username: str, display_name: str, password: str) -> AppUser:
    username = normalize_username(username)
    if not username or len(username) > 60:
        raise ValueError("El usuario debe tener entre 1 y 60 caracteres.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.")
    if get_user(session, username) is not None:
        raise ValueError(f"Ya existe el usuario «{username}».")
    user = AppUser(
        username=username,
        display_name=display_name.strip() or username,
        password_hash=hash_password(password),
    )
    session.add(user)
    session.flush()
    return user


def set_password(session: Session, username: str, password: str) -> AppUser:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.")
    user = get_user(session, username)
    if user is None:
        raise ValueError(f"No existe el usuario «{username}».")
    user.password_hash = hash_password(password)
    session.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    return user


def ensure_default_user(session: Session, settings: Settings) -> AppUser | None:
    """Crea la cuenta inicial si la tabla de usuarios está vacía. Devuelve el usuario creado."""
    total = session.scalar(select(func.count()).select_from(AppUser))
    if total:
        return None
    return add_user(session, settings.admin_username, settings.admin_name, settings.admin_password)
