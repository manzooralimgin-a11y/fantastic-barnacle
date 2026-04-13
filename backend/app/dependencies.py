from collections.abc import Callable
from dataclasses import dataclass
import json
import logging

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import UserRole
from app.auth.utils import decode_access_token
from app.config import settings
from app.database import get_db

logger = logging.getLogger("app.authz")
security = HTTPBearer(auto_error=False)


@dataclass(slots=True)
class HotelAccessContext:
    user: object
    active_property_id: int | None
    hotel_roles: tuple[str, ...]
    hotel_permissions: tuple[str, ...]
    hotel_properties: tuple[dict, ...]

    @property
    def property_ids(self) -> set[int]:
        return {
            int(property_item["property_id"])
            for property_item in self.hotel_properties
            if property_item.get("property_id") is not None
        }

    def resolve_property_id(self, requested_property_id: int | None) -> int | None:
        if requested_property_id is None:
            return self.active_property_id
        if requested_property_id not in self.property_ids:
            return None
        return requested_property_id


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
    request.state.active_property_id = token_data.get("active_property_id") or user.active_property_id
    request.state.hotel_permissions = token_data.get("hotel_permissions") or []
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


async def get_current_hotel_user(
    request: Request,
    property_id: int | None = Query(default=None, gt=0),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HotelAccessContext:
    from app.hms.rbac import get_hotel_access_context

    context = await get_hotel_access_context(
        db,
        current_user,
        preferred_property_id=property_id or getattr(current_user, "active_property_id", None),
        persist_active_property=True,
    )
    if context.active_property_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No hotel property access configured for user",
        )

    resolved_property_id = context.resolve_property_id(property_id)
    if property_id is not None and resolved_property_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to the requested hotel property",
        )

    property_payloads = tuple(
        {
            "property_id": property_item.property_id,
            "property_name": property_item.property_name,
            "role_codes": list(property_item.role_codes),
            "permissions": list(property_item.permissions),
        }
        for property_item in context.properties
    )
    active_property_id = resolved_property_id or context.active_property_id

    request.state.active_property_id = active_property_id
    request.state.restaurant_id = getattr(current_user, "restaurant_id", None)
    request.state.hotel_permissions = list(context.hotel_permissions)
    request.state.hotel_roles = list(context.hotel_roles)

    return HotelAccessContext(
        user=current_user,
        active_property_id=active_property_id,
        hotel_roles=context.hotel_roles,
        hotel_permissions=context.hotel_permissions,
        hotel_properties=property_payloads,
    )


def require_hotel_permissions(*required_permissions: str) -> Callable:
    async def permission_guard(
        request: Request,
        hotel_access: HotelAccessContext = Depends(get_current_hotel_user),
    ) -> HotelAccessContext:
        missing_permissions = [
            permission
            for permission in required_permissions
            if permission not in set(hotel_access.hotel_permissions)
        ]
        if missing_permissions:
            logger.warning(
                json.dumps(
                    {
                        "event": "hotel_authorization_denied",
                        "path": request.url.path,
                        "method": request.method,
                        "user_id": getattr(hotel_access.user, "id", None),
                        "active_property_id": hotel_access.active_property_id,
                        "missing_permissions": missing_permissions,
                        "available_permissions": list(hotel_access.hotel_permissions),
                    }
                )
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient hotel permissions",
            )
        return hotel_access

    return permission_guard
