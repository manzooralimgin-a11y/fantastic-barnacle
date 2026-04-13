from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Restaurant, User, UserRole
from app.auth.schemas import LoginRequest, RegisterRequest, TokenResponse, UserRead
from app.auth.utils import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.hms.rbac import get_first_hotel_property_id, get_hotel_access_context, serialize_hotel_access_context
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
        active_property_id=await get_first_hotel_property_id(db),
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
    return await _issue_tokens(db, user)


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
    return await _issue_tokens(db, user)


async def build_user_read(db: AsyncSession, user: User) -> UserRead:
    hotel_context = await get_hotel_access_context(
        db,
        user,
        preferred_property_id=user.active_property_id,
        persist_active_property=True,
    )
    hotel_payload = serialize_hotel_access_context(hotel_context)
    return UserRead(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        restaurant_id=user.restaurant_id,
        active_property_id=hotel_payload["active_property_id"],
        hotel_roles=hotel_payload["hotel_roles"],
        hotel_permissions=hotel_payload["hotel_permissions"],
        hotel_properties=hotel_payload["hotel_properties"],
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


async def _issue_tokens(db: AsyncSession, user: User) -> TokenResponse:
    hotel_context = await get_hotel_access_context(
        db,
        user,
        preferred_property_id=user.active_property_id,
        persist_active_property=True,
    )
    access = create_access_token(
        user.id,
        extra={
            "role": user.role.value,
            "restaurant_id": user.restaurant_id,
            "active_property_id": hotel_context.active_property_id,
            "hotel_permissions": list(hotel_context.hotel_permissions),
        },
    )
    refresh = create_refresh_token(user.id)
    return TokenResponse(access_token=access, refresh_token=refresh)
