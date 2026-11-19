"""Inicio y cierre de sesión."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import auth
from app.api.dependencies import get_session, require_user, session_token
from app.api.errors import ApiError
from app.config import Settings, get_settings
from app.storage.models import AppUser

router = APIRouter(prefix="/api/v1/auth", tags=["sesión"])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=200)


def _user_body(user: AppUser) -> dict:
    return {"username": user.username, "display_name": user.display_name}


@router.post("/login")
def login(
    body: LoginIn,
    response: Response,
    session: Session = Depends(get_session, scope="function"),
    settings: Settings = Depends(get_settings),
) -> dict:
    key = auth.normalize_username(body.username)
    wait = auth.throttle.remaining(key)
    if wait:
        raise ApiError(
            429,
            "TOO_MANY_ATTEMPTS",
            f"Demasiados intentos fallidos. Espere {wait} s para volver a intentarlo.",
            "password",
            {"retry_after": wait},
        )
    user = auth.authenticate(session, body.username, body.password)
    if user is None:
        auth.throttle.failed(key, settings.login_max_attempts, settings.login_lock_seconds)
        raise ApiError(401, "INVALID_CREDENTIALS", "Usuario o contraseña incorrectos.", "password")
    auth.throttle.succeeded(key)
    token = auth.create_session(session, user, settings.session_hours)
    response.set_cookie(
        auth.SESSION_COOKIE,
        token,
        max_age=int(settings.session_hours * 3600),
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies,
        path="/",
    )
    # El token también viaja en el cuerpo: un frontend en otro dominio (Amplify) lo guarda y lo
    # envía como «Authorization: Bearer», sin depender de cookies de terceros.
    return {"user": _user_body(user), "token": token}


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    session: Session = Depends(get_session, scope="function"),
) -> Response:
    auth.revoke_session(session, session_token(request))
    response = Response(status_code=204)
    response.delete_cookie(auth.SESSION_COOKIE, path="/")
    return response


@router.get("/me")
def me(user: AppUser = Depends(require_user)) -> dict:
    return {"user": _user_body(user)}
