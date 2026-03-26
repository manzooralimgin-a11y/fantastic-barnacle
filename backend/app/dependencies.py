from collections.abc import Callable
import json
import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import UserRole
from app.auth.utils import decode_access_token
from app.config import settings
from app.database import get_db

logger = logging.getLogger("app.authz")
security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    from app.auth.models import User

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    token_data = decode_access_token(credentials.credentials)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    try:
        user_id = int(token_data["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    from sqlalchemy import select

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    token_restaurant_id = token_data.get("restaurant_id")
    if token_restaurant_id is not None and user.restaurant_id != token_restaurant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tenant mismatch",
        )
    request.state.user_id = user.id
    request.state.restaurant_id = user.restaurant_id
    request.state.user_role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return user


async def get_current_tenant_user(request: Request, current_user=Depends(get_current_user)):
    if settings.app_env.lower() != "development" and current_user.restaurant_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant context missing for user",
        )
    request.state.restaurant_id = current_user.restaurant_id
    return current_user


async def get_optional_current_tenant_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None

    current_user = await get_current_user(request, credentials, db)
    if settings.app_env.lower() != "development" and current_user.restaurant_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant context missing for user",
        )
    request.state.restaurant_id = current_user.restaurant_id
    return current_user


def require_roles(*allowed_roles: UserRole) -> Callable:
    async def role_guard(request: Request, current_user=Depends(get_current_tenant_user)):
        # Ensure we compare values correctly regardless of whether role is enum or string
        user_role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        allowed_vals = [r.value if hasattr(r, "value") else str(r) for r in allowed_roles]

        if user_role_val not in allowed_vals:
            logger.warning(
                json.dumps(
                    {
                        "event": "authorization_denied",
                        "path": request.url.path,
                        "method": request.method,
                        "user_id": getattr(current_user, "id", None),
                        "restaurant_id": getattr(current_user, "restaurant_id", None),
                        "user_role": user_role_val,
                        "allowed_roles": allowed_vals,
                    }
                )
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return role_guard
