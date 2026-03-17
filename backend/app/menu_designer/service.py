from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.menu_designer.models import MenuTemplate, MenuDesign


# ── Templates ──

async def get_templates(db: AsyncSession, restaurant_id: int) -> list[MenuTemplate]:
    result = await db.execute(
        select(MenuTemplate)
        .where(MenuTemplate.restaurant_id == restaurant_id)
        .order_by(MenuTemplate.created_at.desc())
    )
    return list(result.scalars().all())


async def get_template(db: AsyncSession, restaurant_id: int, template_id: int) -> MenuTemplate | None:
    result = await db.execute(
        select(MenuTemplate).where(MenuTemplate.id == template_id, MenuTemplate.restaurant_id == restaurant_id)
    )
    return result.scalar_one_or_none()


async def create_template(db: AsyncSession, restaurant_id: int, data: dict) -> MenuTemplate:
    t = MenuTemplate(**data, restaurant_id=restaurant_id)
    db.add(t)
    await db.flush()
    await db.refresh(t)
    return t


async def delete_template(db: AsyncSession, restaurant_id: int, template_id: int) -> bool:
    t = await get_template(db, restaurant_id, template_id)
    if not t or t.is_system:
        return False
    await db.delete(t)
    await db.flush()
    return True


# ── Designs ──

async def get_designs(db: AsyncSession, restaurant_id: int) -> list[MenuDesign]:
    result = await db.execute(
        select(MenuDesign)
        .where(MenuDesign.restaurant_id == restaurant_id)
        .order_by(MenuDesign.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_design(db: AsyncSession, restaurant_id: int, design_id: int) -> MenuDesign | None:
    result = await db.execute(
        select(MenuDesign).where(MenuDesign.id == design_id, MenuDesign.restaurant_id == restaurant_id)
    )
    return result.scalar_one_or_none()


async def create_design(db: AsyncSession, restaurant_id: int, data: dict) -> MenuDesign:
    d = MenuDesign(**data, restaurant_id=restaurant_id)
    db.add(d)
    await db.flush()
    await db.refresh(d)
    return d


async def update_design(db: AsyncSession, restaurant_id: int, design_id: int, data: dict) -> MenuDesign | None:
    d = await get_design(db, restaurant_id, design_id)
    if not d:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(d, k, v)
    await db.flush()
    await db.refresh(d)
    return d


async def publish_design(db: AsyncSession, restaurant_id: int, design_id: int):
    d = await get_design(db, restaurant_id, design_id)
    if not d:
        return None
    # Unpublish all other published designs for this restaurant
    await db.execute(
        update(MenuDesign)
        .where(
            MenuDesign.restaurant_id == restaurant_id,
            MenuDesign.status == "published",
            MenuDesign.id != design_id,
        )
        .values(status="draft")
    )
    d.status = "published"
    await db.flush()
    await db.refresh(d)
    return d


async def delete_design(db: AsyncSession, restaurant_id: int, design_id: int) -> bool:
    d = await get_design(db, restaurant_id, design_id)
    if not d:
        return False
    await db.delete(d)
    await db.flush()
    return True


async def get_design_preview(db: AsyncSession, restaurant_id: int, design_id: int):
    """Get design data merged with menu items for preview."""
    from app.menu.models import MenuCategory, MenuItem
    d = await get_design(db, restaurant_id, design_id)
    if not d:
        return None

    # Fetch menu data
    cats_result = await db.execute(
        select(MenuCategory).where(MenuCategory.is_active == True).order_by(MenuCategory.sort_order)
    )
    categories = list(cats_result.scalars().all())

    items_result = await db.execute(
        select(MenuItem).where(MenuItem.is_available == True).order_by(MenuItem.sort_order)
    )
    items = list(items_result.scalars().all())

    return {
        "design": {
            "id": d.id,
            "name": d.name,
            "template_id": d.template_id,
            "design_data": d.design_data_json,
            "translations": d.translations_json,
            "language": d.language,
            "status": d.status,
        },
        "categories": [{"id": c.id, "name": c.name} for c in categories],
        "items": [
            {
                "id": it.id,
                "name": it.name,
                "description": it.description,
                "price": float(it.price),
                "category_id": it.category_id,
                "allergens": it.allergens_json.get("tags", []) if it.allergens_json else [],
                "dietary_tags": it.dietary_tags_json.get("tags", []) if it.dietary_tags_json else [],
            }
            for it in items
        ],
    }
