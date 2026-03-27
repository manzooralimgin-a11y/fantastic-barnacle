from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.menu.models import MenuCategory, MenuCombo, MenuItem, MenuItemModifier, MenuModifier, UpsellRule
from app.menu.schemas import (
    MenuCategoryCreate,
    MenuCategoryUpdate,
    MenuComboCreate,
    MenuComboUpdate,
    MenuItemCreate,
    MenuItemUpdate,
    MenuModifierCreate,
    MenuModifierUpdate,
    MenuItemModifierCreate,
    UpsellRuleCreate,
    UpsellRuleUpdate,
)


def _serialize_public_menu_item(item: MenuItem, *, category_name: str) -> dict:
    allergens = []
    if item.allergens_json and isinstance(item.allergens_json, dict):
        allergens = item.allergens_json.get("tags", [])
    dietary = []
    if item.dietary_tags_json and isinstance(item.dietary_tags_json, dict):
        dietary = item.dietary_tags_json.get("tags", [])

    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": float(item.price),
        "category_id": item.category_id,
        "category_name": category_name,
        "image_url": item.image_url,
        "is_available": item.is_available,
        "prep_time_min": item.prep_time_min,
        "allergens": allergens,
        "dietary_tags": dietary,
    }


# ── Categories ──

async def get_categories(db: AsyncSession, restaurant_id: int) -> list[MenuCategory]:
    result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.restaurant_id == restaurant_id)
        .order_by(MenuCategory.sort_order, MenuCategory.name)
    )
    return list(result.scalars().all())


async def get_category_by_id(db: AsyncSession, restaurant_id: int, category_id: int) -> MenuCategory:
    result = await db.execute(
        select(MenuCategory).where(
            MenuCategory.id == category_id,
            MenuCategory.restaurant_id == restaurant_id,
        )
    )
    cat = result.scalar_one_or_none()
    if cat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return cat


async def create_category(db: AsyncSession, restaurant_id: int, payload: MenuCategoryCreate) -> MenuCategory:
    cat = MenuCategory(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


async def update_category(
    db: AsyncSession, restaurant_id: int, category_id: int, payload: MenuCategoryUpdate
) -> MenuCategory:
    cat = await get_category_by_id(db, restaurant_id, category_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await db.flush()
    await db.refresh(cat)
    return cat


async def delete_category(db: AsyncSession, restaurant_id: int, category_id: int) -> None:
    cat = await get_category_by_id(db, restaurant_id, category_id)
    await db.delete(cat)
    await db.flush()


# ── Items ──

async def get_items(
    db: AsyncSession,
    restaurant_id: int,
    category_id: int | None = None,
    dietary: str | None = None,
    search: str | None = None,
    available: bool | None = None,
) -> list[MenuItem]:
    query = (
        select(MenuItem)
        .where(MenuItem.restaurant_id == restaurant_id)
        .order_by(MenuItem.sort_order, MenuItem.name)
    )
    if category_id:
        query = query.where(MenuItem.category_id == category_id)
    if available is not None:
        query = query.where(MenuItem.is_available == available)
        if available:
            query = query.where(MenuItem.price > 0)
    if search:
        query = query.where(MenuItem.name.ilike(f"%{search}%"))
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_public_menu_catalog(
    db: AsyncSession,
    restaurant_id: int | None = None,
) -> list[dict]:
    category_query = (
        select(MenuCategory)
        .where(MenuCategory.is_active == True)
        .order_by(MenuCategory.sort_order, MenuCategory.name)
    )
    if restaurant_id is not None:
        category_query = category_query.where(MenuCategory.restaurant_id == restaurant_id)
    categories = list((await db.execute(category_query)).scalars().all())

    item_query = (
        select(MenuItem)
        .join(MenuCategory, MenuCategory.id == MenuItem.category_id)
        .where(
            MenuItem.is_available == True,
            MenuItem.price > 0,
            MenuCategory.is_active == True,
        )
        .order_by(MenuCategory.sort_order, MenuItem.sort_order, MenuItem.name)
    )
    if restaurant_id is not None:
        item_query = item_query.where(
            MenuItem.restaurant_id == restaurant_id,
            MenuCategory.restaurant_id == restaurant_id,
        )
    items = list((await db.execute(item_query)).scalars().all())

    category_map: dict[int, dict] = {
        category.id: {
            "id": category.id,
            "name": category.name,
            "items": [],
        }
        for category in categories
    }

    for item in items:
        category = category_map.get(item.category_id)
        if category is None:
            continue
        category["items"].append(
            _serialize_public_menu_item(item, category_name=category["name"])
        )

    return [category for category in category_map.values() if category["items"]]


async def get_item_by_id(db: AsyncSession, restaurant_id: int, item_id: int) -> MenuItem:
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.restaurant_id == restaurant_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    return item


async def create_item(db: AsyncSession, restaurant_id: int, payload: MenuItemCreate) -> MenuItem:
    await get_category_by_id(db, restaurant_id, payload.category_id)
    item = MenuItem(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def update_item(
    db: AsyncSession, restaurant_id: int, item_id: int, payload: MenuItemUpdate
) -> MenuItem:
    item = await get_item_by_id(db, restaurant_id, item_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    await db.flush()
    await db.refresh(item)
    return item


async def delete_item(db: AsyncSession, restaurant_id: int, item_id: int) -> None:
    item = await get_item_by_id(db, restaurant_id, item_id)
    await db.delete(item)
    await db.flush()


# ── Modifiers ──

async def get_modifiers(
    db: AsyncSession, restaurant_id: int, group_name: str | None = None
) -> list[MenuModifier]:
    query = (
        select(MenuModifier)
        .where(MenuModifier.restaurant_id == restaurant_id)
        .order_by(MenuModifier.group_name, MenuModifier.name)
    )
    if group_name:
        query = query.where(MenuModifier.group_name == group_name)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_modifier(db: AsyncSession, restaurant_id: int, payload: MenuModifierCreate) -> MenuModifier:
    mod = MenuModifier(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(mod)
    await db.flush()
    await db.refresh(mod)
    return mod


async def update_modifier(
    db: AsyncSession, restaurant_id: int, modifier_id: int, payload: MenuModifierUpdate
) -> MenuModifier:
    result = await db.execute(
        select(MenuModifier).where(
            MenuModifier.id == modifier_id,
            MenuModifier.restaurant_id == restaurant_id,
        )
    )
    mod = result.scalar_one_or_none()
    if mod is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modifier not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(mod, k, v)
    await db.flush()
    await db.refresh(mod)
    return mod


async def delete_modifier(db: AsyncSession, restaurant_id: int, modifier_id: int) -> None:
    result = await db.execute(
        select(MenuModifier).where(
            MenuModifier.id == modifier_id,
            MenuModifier.restaurant_id == restaurant_id,
        )
    )
    mod = result.scalar_one_or_none()
    if mod is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modifier not found")
    await db.delete(mod)
    await db.flush()


# ── Item-Modifier Links ──

async def get_item_modifiers(db: AsyncSession, restaurant_id: int, item_id: int) -> list[MenuModifier]:
    await get_item_by_id(db, restaurant_id, item_id)
    result = await db.execute(
        select(MenuModifier)
        .join(MenuItemModifier, MenuModifier.id == MenuItemModifier.modifier_id)
        .where(
            MenuItemModifier.item_id == item_id,
            MenuModifier.restaurant_id == restaurant_id,
        )
    )
    return list(result.scalars().all())


async def link_item_modifier(
    db: AsyncSession, restaurant_id: int, payload: MenuItemModifierCreate
) -> MenuItemModifier:
    await get_item_by_id(db, restaurant_id, payload.item_id)
    mod_result = await db.execute(
        select(MenuModifier).where(
            MenuModifier.id == payload.modifier_id,
            MenuModifier.restaurant_id == restaurant_id,
        )
    )
    if mod_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modifier not found")
    link = MenuItemModifier(**payload.model_dump())
    db.add(link)
    await db.flush()
    await db.refresh(link)
    return link


async def unlink_item_modifier(db: AsyncSession, restaurant_id: int, link_id: int) -> None:
    result = await db.execute(
        select(MenuItemModifier)
        .join(MenuItem, MenuItem.id == MenuItemModifier.item_id)
        .where(
            MenuItemModifier.id == link_id,
            MenuItem.restaurant_id == restaurant_id,
        )
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    await db.delete(link)
    await db.flush()


# ── Combos ──

async def get_combos(db: AsyncSession, restaurant_id: int) -> list[MenuCombo]:
    result = await db.execute(
        select(MenuCombo)
        .where(MenuCombo.restaurant_id == restaurant_id, MenuCombo.is_active == True)
        .order_by(MenuCombo.name)
    )
    return list(result.scalars().all())


async def create_combo(db: AsyncSession, restaurant_id: int, payload: MenuComboCreate) -> MenuCombo:
    combo = MenuCombo(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(combo)
    await db.flush()
    await db.refresh(combo)
    return combo


async def update_combo(
    db: AsyncSession, restaurant_id: int, combo_id: int, payload: MenuComboUpdate
) -> MenuCombo:
    result = await db.execute(
        select(MenuCombo).where(MenuCombo.id == combo_id, MenuCombo.restaurant_id == restaurant_id)
    )
    combo = result.scalar_one_or_none()
    if combo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Combo not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(combo, k, v)
    await db.flush()
    await db.refresh(combo)
    return combo


async def delete_combo(db: AsyncSession, restaurant_id: int, combo_id: int) -> None:
    result = await db.execute(
        select(MenuCombo).where(MenuCombo.id == combo_id, MenuCombo.restaurant_id == restaurant_id)
    )
    combo = result.scalar_one_or_none()
    if combo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Combo not found")
    await db.delete(combo)
    await db.flush()


# ── Upsell Rules (F9) ──

async def get_upsell_rules(
    db: AsyncSession, restaurant_id: int, active_only: bool = False
) -> list[UpsellRule]:
    query = (
        select(UpsellRule)
        .where(UpsellRule.restaurant_id == restaurant_id)
        .order_by(UpsellRule.priority.desc())
    )
    if active_only:
        query = query.where(UpsellRule.is_active == True)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_upsell_rule_by_id(db: AsyncSession, restaurant_id: int, rule_id: int) -> UpsellRule:
    result = await db.execute(
        select(UpsellRule).where(UpsellRule.id == rule_id, UpsellRule.restaurant_id == restaurant_id)
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upsell rule not found")
    return rule


async def create_upsell_rule(
    db: AsyncSession, restaurant_id: int, payload: UpsellRuleCreate
) -> UpsellRule:
    await get_item_by_id(db, restaurant_id, payload.trigger_item_id)
    await get_item_by_id(db, restaurant_id, payload.suggested_item_id)
    rule = UpsellRule(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


async def update_upsell_rule(
    db: AsyncSession, restaurant_id: int, rule_id: int, payload: UpsellRuleUpdate
) -> UpsellRule:
    rule = await get_upsell_rule_by_id(db, restaurant_id, rule_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(rule, k, v)
    await db.flush()
    await db.refresh(rule)
    return rule


async def delete_upsell_rule(db: AsyncSession, restaurant_id: int, rule_id: int) -> None:
    rule = await get_upsell_rule_by_id(db, restaurant_id, rule_id)
    await db.delete(rule)
    await db.flush()


async def get_item_suggestions(db: AsyncSession, restaurant_id: int, item_id: int) -> list[dict]:
    """Get upsell suggestions for a given menu item."""
    await get_item_by_id(db, restaurant_id, item_id)
    rules_result = await db.execute(
        select(UpsellRule).where(
            UpsellRule.restaurant_id == restaurant_id,
            UpsellRule.trigger_item_id == item_id,
            UpsellRule.is_active == True,
        ).order_by(UpsellRule.priority.desc())
    )
    rules = list(rules_result.scalars().all())

    suggestions = []
    for rule in rules:
        item = await db.execute(
            select(MenuItem).where(
                MenuItem.id == rule.suggested_item_id,
                MenuItem.restaurant_id == restaurant_id,
                MenuItem.is_available == True,
            )
        )
        suggested = item.scalar_one_or_none()
        if suggested:
            # Increment times_shown
            rule.times_shown += 1
            suggestions.append({
                "rule_id": rule.id,
                "suggested_item": suggested,
                "rule_type": rule.rule_type,
                "message": rule.message,
            })

    await db.flush()
    return suggestions


async def record_upsell_accepted(db: AsyncSession, restaurant_id: int, rule_id: int) -> UpsellRule:
    rule = await get_upsell_rule_by_id(db, restaurant_id, rule_id)
    rule.times_accepted += 1
    await db.flush()
    await db.refresh(rule)
    return rule


# ── Analytics ──

async def get_menu_analytics(db: AsyncSession, restaurant_id: int) -> dict:
    total = await db.execute(
        select(func.count(MenuItem.id)).where(MenuItem.restaurant_id == restaurant_id)
    )
    active = await db.execute(
        select(func.count(MenuItem.id)).where(
            MenuItem.restaurant_id == restaurant_id,
            MenuItem.is_available == True,
        )
    )
    cats = await db.execute(
        select(func.count(MenuCategory.id)).where(MenuCategory.restaurant_id == restaurant_id)
    )
    featured = await db.execute(
        select(func.count(MenuItem.id)).where(
            MenuItem.restaurant_id == restaurant_id,
            MenuItem.is_featured == True,
        )
    )
    combos_count = await db.execute(
        select(func.count(MenuCombo.id)).where(
            MenuCombo.restaurant_id == restaurant_id,
            MenuCombo.is_active == True,
        )
    )

    # Average food cost percentage
    cost_data = await db.execute(
        select(func.avg(MenuItem.cost / MenuItem.price * 100)).where(
            MenuItem.restaurant_id == restaurant_id,
            MenuItem.price > 0,
        )
    )
    avg_cost = cost_data.scalar() or 0

    return {
        "total_items": total.scalar() or 0,
        "active_items": active.scalar() or 0,
        "categories_count": cats.scalar() or 0,
        "avg_food_cost_pct": round(float(avg_cost), 1),
        "featured_count": featured.scalar() or 0,
        "combos_count": combos_count.scalar() or 0,
    }
