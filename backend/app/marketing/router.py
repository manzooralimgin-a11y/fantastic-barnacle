from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.marketing.schemas import (
    CampaignCreate,
    CampaignRead,
    ReviewRead,
    ReviewResponseRequest,
    SocialPostCreate,
    SocialPostRead,
)
from app.marketing.service import (
    create_campaign,
    generate_social_content,
    get_campaigns,
    get_reputation_score,
    get_reviews,
    get_social_posts,
    respond_to_review,
)

router = APIRouter()


@router.get("/reviews", response_model=list[ReviewRead])
async def list_reviews(
    platform: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_reviews(db, current_user.restaurant_id, platform, limit)


@router.post("/reviews/{review_id}/respond", response_model=ReviewRead)
async def review_respond(
    review_id: int,
    payload: ReviewResponseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await respond_to_review(db, current_user.restaurant_id, review_id, payload)


@router.get("/campaigns", response_model=list[CampaignRead])
async def list_campaigns(
    status: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_campaigns(db, current_user.restaurant_id, status, limit)


@router.post("/campaigns", response_model=CampaignRead, status_code=201)
async def add_campaign(
    payload: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_campaign(db, current_user.restaurant_id, payload)


@router.get("/social", response_model=list[SocialPostRead])
async def list_social_posts(
    platform: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_social_posts(db, current_user.restaurant_id, platform, limit)


@router.post("/social/generate", response_model=SocialPostRead, status_code=201)
async def gen_social_content(
    payload: SocialPostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await generate_social_content(db, current_user.restaurant_id, payload)


@router.get("/reputation", response_model=dict[str, Any])
async def reputation_score(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_reputation_score(db, current_user.restaurant_id)
