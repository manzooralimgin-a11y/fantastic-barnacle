import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.signage.models import SignageScreen, SignageContent, SignagePlaylist


# ── Screens ──

async def get_screens(db: AsyncSession, restaurant_id: int) -> list[SignageScreen]:
    result = await db.execute(
        select(SignageScreen)
        .where(SignageScreen.restaurant_id == restaurant_id)
        .order_by(SignageScreen.created_at.desc())
    )
    return list(result.scalars().all())


async def get_screen(db: AsyncSession, restaurant_id: int, screen_id: int) -> SignageScreen | None:
    result = await db.execute(
        select(SignageScreen).where(SignageScreen.id == screen_id, SignageScreen.restaurant_id == restaurant_id)
    )
    return result.scalar_one_or_none()


async def create_screen(db: AsyncSession, restaurant_id: int, data: dict) -> SignageScreen:
    code = secrets.token_urlsafe(12)
    s = SignageScreen(screen_code=code, restaurant_id=restaurant_id, **data)
    db.add(s)
    await db.flush()
    await db.refresh(s)
    return s


async def update_screen(db: AsyncSession, restaurant_id: int, screen_id: int, data: dict) -> SignageScreen | None:
    s = await get_screen(db, restaurant_id, screen_id)
    if not s:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(s, k, v)
    await db.flush()
    await db.refresh(s)
    return s


async def delete_screen(db: AsyncSession, restaurant_id: int, screen_id: int) -> bool:
    s = await get_screen(db, restaurant_id, screen_id)
    if not s:
        return False
    await db.delete(s)
    await db.flush()
    return True


# ── Content ──

async def get_content(db: AsyncSession, restaurant_id: int) -> list[SignageContent]:
    result = await db.execute(
        select(SignageContent)
        .where(SignageContent.restaurant_id == restaurant_id)
        .order_by(SignageContent.created_at.desc())
    )
    return list(result.scalars().all())


async def create_content(db: AsyncSession, restaurant_id: int, data: dict) -> SignageContent:
    c = SignageContent(**data, restaurant_id=restaurant_id)
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c


async def update_content(db: AsyncSession, restaurant_id: int, content_id: int, data: dict) -> SignageContent | None:
    result = await db.execute(
        select(SignageContent).where(SignageContent.id == content_id, SignageContent.restaurant_id == restaurant_id)
    )
    c = result.scalar_one_or_none()
    if not c:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(c, k, v)
    await db.flush()
    await db.refresh(c)
    return c


async def delete_content(db: AsyncSession, restaurant_id: int, content_id: int) -> bool:
    result = await db.execute(
        select(SignageContent).where(SignageContent.id == content_id, SignageContent.restaurant_id == restaurant_id)
    )
    c = result.scalar_one_or_none()
    if not c:
        return False
    await db.delete(c)
    await db.flush()
    return True


# ── Playlists ──

async def get_playlists(db: AsyncSession, restaurant_id: int) -> list[SignagePlaylist]:
    result = await db.execute(
        select(SignagePlaylist)
        .where(SignagePlaylist.restaurant_id == restaurant_id)
        .order_by(SignagePlaylist.created_at.desc())
    )
    return list(result.scalars().all())


async def create_playlist(db: AsyncSession, restaurant_id: int, data: dict) -> SignagePlaylist:
    p = SignagePlaylist(**data, restaurant_id=restaurant_id)
    db.add(p)
    await db.flush()
    await db.refresh(p)
    return p


async def update_playlist(db: AsyncSession, restaurant_id: int, playlist_id: int, data: dict) -> SignagePlaylist | None:
    result = await db.execute(
        select(SignagePlaylist).where(SignagePlaylist.id == playlist_id, SignagePlaylist.restaurant_id == restaurant_id)
    )
    p = result.scalar_one_or_none()
    if not p:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(p, k, v)
    await db.flush()
    await db.refresh(p)
    return p


async def delete_playlist(db: AsyncSession, restaurant_id: int, playlist_id: int) -> bool:
    result = await db.execute(
        select(SignagePlaylist).where(SignagePlaylist.id == playlist_id, SignagePlaylist.restaurant_id == restaurant_id)
    )
    p = result.scalar_one_or_none()
    if not p:
        return False
    await db.delete(p)
    await db.flush()
    return True


# ── Public Display ──

async def get_display_data(db: AsyncSession, screen_code: str):
    """Get the current display content for a screen (public, no auth)."""
    result = await db.execute(select(SignageScreen).where(SignageScreen.screen_code == screen_code, SignageScreen.is_active == True))
    screen = result.scalar_one_or_none()
    if not screen:
        return None

    # Update last ping
    screen.last_ping_at = datetime.now(timezone.utc)
    await db.flush()

    # Get playlist
    playlist = None
    content_items = []
    if screen.current_playlist_id:
        pl_result = await db.execute(select(SignagePlaylist).where(SignagePlaylist.id == screen.current_playlist_id))
        playlist = pl_result.scalar_one_or_none()

    if playlist and playlist.items_json:
        content_ids = [item.get("content_id") for item in playlist.items_json if item.get("content_id")]
        if content_ids:
            c_result = await db.execute(
                select(SignageContent).where(SignageContent.id.in_(content_ids), SignageContent.is_active == True)
            )
            content_map = {c.id: c for c in c_result.scalars().all()}
            for item in playlist.items_json:
                cid = item.get("content_id")
                if cid in content_map:
                    c = content_map[cid]
                    content_items.append({
                        "id": c.id,
                        "title": c.title,
                        "content_type": c.content_type,
                        "content_data": c.content_data_json,
                        "duration": item.get("duration_override") or c.duration_seconds,
                    })
    else:
        # No playlist — show all active content for this screen's restaurant
        all_content = await db.execute(
            select(SignageContent).where(
                SignageContent.restaurant_id == screen.restaurant_id,
                SignageContent.is_active == True,
            )
        )
        for c in all_content.scalars().all():
            content_items.append({
                "id": c.id,
                "title": c.title,
                "content_type": c.content_type,
                "content_data": c.content_data_json,
                "duration": c.duration_seconds,
            })

    return {
        "screen": {
            "id": screen.id,
            "name": screen.name,
            "resolution": screen.resolution,
            "orientation": screen.orientation,
        },
        "playlist": {
            "id": playlist.id if playlist else None,
            "name": playlist.name if playlist else "Default",
        },
        "content": content_items,
    }
