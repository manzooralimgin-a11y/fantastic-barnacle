from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.inventory.models import (
    AutoPurchaseRule,
    InventoryItem,
    InventoryMovement,
    PurchaseOrder,
    SupplierCatalogItem,
    TVAReport,
    Vendor,
)
from app.inventory.schemas import (
    AutoPurchaseRuleCreate,
    AutoPurchaseRuleUpdate,
    GoodsReceiptCreate,
    InventoryItemCreate,
    InventoryItemUpdate,
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
    SupplierCatalogItemCreate,
    VendorCreate,
    VendorUpdate,
)
from app.shared.audit import log_human_action


async def _get_vendor_for_restaurant(
    db: AsyncSession, restaurant_id: int, vendor_id: int | None
) -> Vendor | None:
    if vendor_id is None:
        return None
    result = await db.execute(
        select(Vendor).where(Vendor.id == vendor_id, Vendor.restaurant_id == restaurant_id)
    )
    vendor = result.scalar_one_or_none()
    if vendor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


async def _get_inventory_item_for_restaurant(
    db: AsyncSession, restaurant_id: int, item_id: int | None
) -> InventoryItem | None:
    if item_id is None:
        return None
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.restaurant_id == restaurant_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    return item


async def get_inventory_items(
    db: AsyncSession, restaurant_id: int, category: str | None = None, limit: int = 100
) -> list[InventoryItem]:
    query = (
        select(InventoryItem)
        .where(InventoryItem.restaurant_id == restaurant_id)
        .order_by(InventoryItem.name)
        .limit(limit)
    )
    if category:
        query = query.where(InventoryItem.category == category)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_inventory_item(
    db: AsyncSession, restaurant_id: int, payload: InventoryItemCreate
) -> InventoryItem:
    await _get_vendor_for_restaurant(db, restaurant_id, payload.vendor_id)
    item = InventoryItem(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(item)
    await db.flush()
    await log_human_action(
        db,
        action="inventory_item_created",
        detail=f"Created inventory item '{item.name}'",
        entity_type="inventory",
        entity_id=item.id,
        source_module="inventory",
        restaurant_id=restaurant_id,
    )
    await db.refresh(item)
    return item


async def update_inventory_item(
    db: AsyncSession, restaurant_id: int, item_id: int, payload: InventoryItemUpdate
) -> InventoryItem:
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.restaurant_id == restaurant_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )
    update_data = payload.model_dump(exclude_unset=True)
    if "vendor_id" in update_data and update_data["vendor_id"] is not None:
        await _get_vendor_for_restaurant(db, restaurant_id, update_data["vendor_id"])
    for key, value in update_data.items():
        setattr(item, key, value)
    await db.flush()
    await log_human_action(
        db,
        action="inventory_item_updated",
        detail=f"Updated inventory item '{item.name}'",
        entity_type="inventory",
        entity_id=item.id,
        source_module="inventory",
        restaurant_id=restaurant_id,
    )
    await db.refresh(item)
    return item


async def get_purchase_orders(
    db: AsyncSession, restaurant_id: int, status_filter: str | None = None, limit: int = 100
) -> list[PurchaseOrder]:
    query = (
        select(PurchaseOrder)
        .where(PurchaseOrder.restaurant_id == restaurant_id)
        .order_by(PurchaseOrder.order_date.desc())
        .limit(limit)
    )
    if status_filter:
        query = query.where(PurchaseOrder.status == status_filter)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_purchase_order(
    db: AsyncSession, restaurant_id: int, payload: PurchaseOrderCreate
) -> PurchaseOrder:
    await _get_vendor_for_restaurant(db, restaurant_id, payload.vendor_id)
    order = PurchaseOrder(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(order)
    await db.flush()
    await log_human_action(
        db,
        action="purchase_order_created",
        detail=f"Created purchase order #{order.id}",
        entity_type="inventory",
        entity_id=order.id,
        source_module="inventory",
        restaurant_id=restaurant_id,
    )
    await db.refresh(order)
    return order


async def update_purchase_order(
    db: AsyncSession, restaurant_id: int, order_id: int, payload: PurchaseOrderUpdate
) -> PurchaseOrder:
    result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == order_id,
            PurchaseOrder.restaurant_id == restaurant_id,
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(order, k, v)
    await db.flush()
    await db.refresh(order)
    return order


async def receive_purchase_order(
    db: AsyncSession, restaurant_id: int, order_id: int, payload: GoodsReceiptCreate
) -> PurchaseOrder:
    """Process goods receipt for a purchase order."""
    result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == order_id,
            PurchaseOrder.restaurant_id == restaurant_id,
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")

    order.received_items_json = payload.received_items_json
    order.actual_delivery_date = payload.actual_delivery_date or date.today()
    order.delivery_status = "received"
    order.status = "received"
    if payload.notes:
        order.notes = (order.notes or "") + "\n" + payload.notes

    # Update inventory stock levels from received items
    received = payload.received_items_json
    if isinstance(received, dict) and "items" in received:
        # Batch-load all referenced inventory items in one query to avoid N+1
        received_item_ids = [
            ri.get("inventory_item_id")
            for ri in received["items"]
            if ri.get("inventory_item_id") and ri.get("quantity", 0)
        ]
        inv_items_by_id: dict[int, InventoryItem] = {}
        if received_item_ids:
            inv_result = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.id.in_(received_item_ids),
                    InventoryItem.restaurant_id == restaurant_id,
                )
            )
            inv_items_by_id = {item.id: item for item in inv_result.scalars().all()}

        for ri in received["items"]:
            item_id = ri.get("inventory_item_id")
            qty = ri.get("quantity", 0)
            if item_id and qty:
                inv_item = inv_items_by_id.get(item_id)
                if inv_item:
                    inv_item.current_stock += qty
                    # Record movement
                    movement = InventoryMovement(
                        restaurant_id=restaurant_id,
                        item_id=item_id,
                        quantity=qty,
                        movement_type="purchase_receipt",
                        reason=f"PO #{order_id} received",
                    )
                    db.add(movement)

    await db.flush()
    await log_human_action(
        db,
        action="purchase_order_received",
        detail=f"Marked purchase order #{order.id} as received",
        entity_type="inventory",
        entity_id=order.id,
        source_module="inventory",
        restaurant_id=restaurant_id,
    )
    await db.refresh(order)
    return order


async def get_vendors(db: AsyncSession, restaurant_id: int, active_only: bool = True) -> list[Vendor]:
    query = select(Vendor).where(Vendor.restaurant_id == restaurant_id).order_by(Vendor.name)
    if active_only:
        query = query.where(Vendor.is_active == True)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_vendor(db: AsyncSession, restaurant_id: int, payload: VendorCreate) -> Vendor:
    vendor = Vendor(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(vendor)
    await db.flush()
    await log_human_action(
        db,
        action="vendor_created",
        detail=f"Created vendor '{vendor.name}'",
        entity_type="inventory",
        entity_id=vendor.id,
        source_module="inventory",
        restaurant_id=restaurant_id,
    )
    await db.refresh(vendor)
    return vendor


async def update_vendor(
    db: AsyncSession, restaurant_id: int, vendor_id: int, payload: VendorUpdate
) -> Vendor:
    result = await db.execute(
        select(Vendor).where(Vendor.id == vendor_id, Vendor.restaurant_id == restaurant_id)
    )
    vendor = result.scalar_one_or_none()
    if vendor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(vendor, k, v)
    await db.flush()
    await db.refresh(vendor)
    return vendor


async def get_low_stock_items(db: AsyncSession, restaurant_id: int) -> list[InventoryItem]:
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.restaurant_id == restaurant_id,
            InventoryItem.current_stock < InventoryItem.par_level,
        ).order_by(InventoryItem.name)
    )
    return list(result.scalars().all())


async def get_tva_report(
    db: AsyncSession, restaurant_id: int, period: str | None = None
) -> list[TVAReport]:
    query = (
        select(TVAReport)
        .where(TVAReport.restaurant_id == restaurant_id)
        .order_by(TVAReport.period.desc())
    )
    if period:
        query = query.where(TVAReport.period == period)
    result = await db.execute(query)
    return list(result.scalars().all())


# ── Supplier Catalog (F7) ──

async def get_vendor_catalog(
    db: AsyncSession, restaurant_id: int, vendor_id: int
) -> list[SupplierCatalogItem]:
    result = await db.execute(
        select(SupplierCatalogItem)
        .where(
            SupplierCatalogItem.vendor_id == vendor_id,
            SupplierCatalogItem.restaurant_id == restaurant_id,
        )
        .order_by(SupplierCatalogItem.supplier_name)
    )
    return list(result.scalars().all())


async def add_catalog_item(
    db: AsyncSession, restaurant_id: int, vendor_id: int, payload: SupplierCatalogItemCreate
) -> SupplierCatalogItem:
    await _get_vendor_for_restaurant(db, restaurant_id, vendor_id)
    await _get_inventory_item_for_restaurant(db, restaurant_id, payload.inventory_item_id)
    item = SupplierCatalogItem(
        vendor_id=vendor_id, restaurant_id=restaurant_id, **payload.model_dump()
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def get_price_comparison(db: AsyncSession, restaurant_id: int, item_id: int) -> dict:
    """Compare prices across vendors for an inventory item."""
    inv_result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.restaurant_id == restaurant_id,
        )
    )
    inv_item = inv_result.scalar_one_or_none()
    if inv_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")

    catalog_result = await db.execute(
        select(SupplierCatalogItem)
        .where(
            SupplierCatalogItem.inventory_item_id == item_id,
            SupplierCatalogItem.restaurant_id == restaurant_id,
            SupplierCatalogItem.is_available == True,
        )
        .order_by(SupplierCatalogItem.unit_price)
    )
    catalog_items = list(catalog_result.scalars().all())

    # Batch-load all referenced vendors in one query to avoid N+1
    vendor_ids = list({ci.vendor_id for ci in catalog_items})
    vendors_by_id: dict[int, Vendor] = {}
    if vendor_ids:
        vendor_result = await db.execute(
            select(Vendor).where(
                Vendor.id.in_(vendor_ids),
                Vendor.restaurant_id == restaurant_id,
            )
        )
        vendors_by_id = {v.id: v for v in vendor_result.scalars().all()}

    vendors_data = []
    for ci in catalog_items:
        vendor = vendors_by_id.get(ci.vendor_id)
        vendors_data.append({
            "vendor_id": ci.vendor_id,
            "vendor_name": vendor.name if vendor else "Unknown",
            "supplier_sku": ci.supplier_sku,
            "unit_price": float(ci.unit_price),
            "unit": ci.unit,
            "min_order_qty": ci.min_order_qty,
        })

    return {
        "inventory_item_id": item_id,
        "item_name": inv_item.name,
        "vendors": vendors_data,
    }


# ── Auto-Purchase Rules (F7) ──

async def get_auto_purchase_rules(
    db: AsyncSession, restaurant_id: int, active_only: bool = False
) -> list[AutoPurchaseRule]:
    query = (
        select(AutoPurchaseRule)
        .where(AutoPurchaseRule.restaurant_id == restaurant_id)
        .order_by(AutoPurchaseRule.id)
    )
    if active_only:
        query = query.where(AutoPurchaseRule.is_active == True)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_auto_purchase_rule(
    db: AsyncSession, restaurant_id: int, payload: AutoPurchaseRuleCreate
) -> AutoPurchaseRule:
    await _get_inventory_item_for_restaurant(db, restaurant_id, payload.inventory_item_id)
    await _get_vendor_for_restaurant(db, restaurant_id, payload.vendor_id)
    rule = AutoPurchaseRule(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(rule)
    await db.flush()
    await log_human_action(
        db,
        action="auto_purchase_rule_created",
        detail=f"Created auto purchase rule #{rule.id}",
        entity_type="inventory",
        entity_id=rule.id,
        source_module="inventory",
        restaurant_id=restaurant_id,
    )
    await db.refresh(rule)
    return rule


async def update_auto_purchase_rule(
    db: AsyncSession, restaurant_id: int, rule_id: int, payload: AutoPurchaseRuleUpdate
) -> AutoPurchaseRule:
    result = await db.execute(
        select(AutoPurchaseRule).where(
            AutoPurchaseRule.id == rule_id,
            AutoPurchaseRule.restaurant_id == restaurant_id,
        )
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auto purchase rule not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(rule, k, v)
    await db.flush()
    await db.refresh(rule)
    return rule


async def delete_auto_purchase_rule(db: AsyncSession, restaurant_id: int, rule_id: int) -> None:
    result = await db.execute(
        select(AutoPurchaseRule).where(
            AutoPurchaseRule.id == rule_id,
            AutoPurchaseRule.restaurant_id == restaurant_id,
        )
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auto purchase rule not found")
    await db.delete(rule)
    await db.flush()
