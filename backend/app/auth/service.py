from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Restaurant, User, UserRole
from app.auth.schemas import LoginRequest, RegisterRequest, TokenResponse
from app.auth.utils import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.shared.audit import emit_sensitive_audit


async def register_user(db: AsyncSession, payload: RegisterRequest) -> User:
    result = await db.execute(select(User).where(func.lower(User.email) == payload.email))
    if result.scalar_one_or_none() is not None:
        emit_sensitive_audit(
            action="auth_register",
            tenant_id=None,
            user_id=None,
            agent_id=None,
            status="blocked",
            detail="Registration conflict: email exists",
            metadata={"email": payload.email},
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    restaurants_result = await db.execute(select(Restaurant.id).order_by(Restaurant.id).limit(2))
    restaurant_ids = list(restaurants_result.scalars().all())
    if len(restaurant_ids) != 1:
        emit_sensitive_audit(
            action="auth_register",
            tenant_id=None,
            user_id=None,
            agent_id=None,
            status="blocked",
            detail="Registration blocked: ambiguous tenant context",
            metadata={"restaurant_count": len(restaurant_ids)},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Self-registration requires exactly one configured restaurant",
        )

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.staff,
        restaurant_id=restaurant_ids[0],
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    emit_sensitive_audit(
        action="auth_register",
        tenant_id=user.restaurant_id,
        user_id=user.id,
        agent_id=None,
        status="success",
        detail="User self-registered",
        metadata={"role": user.role.value},
    )
    return user


async def authenticate_user(db: AsyncSession, payload: LoginRequest) -> TokenResponse:
    result = await db.execute(select(User).where(func.lower(User.email) == payload.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        emit_sensitive_audit(
            action="auth_login",
            tenant_id=None,
            user_id=None,
            agent_id=None,
            status="blocked",
            detail="Invalid credentials",
            metadata={"email": payload.email},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        emit_sensitive_audit(
            action="auth_login",
            tenant_id=user.restaurant_id,
            user_id=user.id,
            agent_id=None,
            status="blocked",
            detail="Deactivated account attempted login",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    emit_sensitive_audit(
        action="auth_login",
        tenant_id=user.restaurant_id,
        user_id=user.id,
        agent_id=None,
        status="success",
        detail="User authenticated",
    )
    return _issue_tokens(user)


async def refresh_tokens(db: AsyncSession, refresh_token: str) -> TokenResponse:
    payload = decode_refresh_token(refresh_token)
    if payload is None:
        emit_sensitive_audit(
            action="auth_refresh",
            tenant_id=None,
            user_id=None,
            agent_id=None,
            status="blocked",
            detail="Invalid refresh token",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        emit_sensitive_audit(
            action="auth_refresh",
            tenant_id=None,
            user_id=user_id,
            agent_id=None,
            status="blocked",
            detail="Refresh user not found",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if not user.is_active:
        emit_sensitive_audit(
            action="auth_refresh",
            tenant_id=user.restaurant_id,
            user_id=user.id,
            agent_id=None,
            status="blocked",
            detail="Deactivated account attempted refresh",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    emit_sensitive_audit(
        action="auth_refresh",
        tenant_id=user.restaurant_id,
        user_id=user.id,
        agent_id=None,
        status="success",
        detail="Token refreshed",
    )
    return _issue_tokens(user)


def _issue_tokens(user: User) -> TokenResponse:
    access = create_access_token(
        user.id,
        extra={"role": user.role.value, "restaurant_id": user.restaurant_id},
    )
    refresh = create_refresh_token(user.id)
    return TokenResponse(access_token=access, refresh_token=refresh)
