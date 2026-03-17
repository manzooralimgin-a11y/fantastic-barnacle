from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.inventory.schemas import (
    AutoPurchaseRuleCreate,
    AutoPurchaseRuleRead,
    AutoPurchaseRuleUpdate,
    GoodsReceiptCreate,
    InventoryItemCreate,
    InventoryItemRead,
    InventoryItemUpdate,
    PurchaseOrderCreate,
    PurchaseOrderRead,
    PurchaseOrderUpdate,
    SupplierCatalogItemCreate,
    SupplierCatalogItemRead,
    TVAReportRead,
    VendorCreate,
    VendorRead,
    VendorUpdate,
)
from app.inventory.service import (
    add_catalog_item,
    create_auto_purchase_rule,
    create_inventory_item,
    create_purchase_order,
    create_vendor,
    delete_auto_purchase_rule,
    get_auto_purchase_rules,
    get_inventory_items,
    get_low_stock_items,
    get_price_comparison,
    get_purchase_orders,
    get_tva_report,
    get_vendor_catalog,
    get_vendors,
    receive_purchase_order,
    update_auto_purchase_rule,
    update_inventory_item,
    update_purchase_order,
    update_vendor,
)

router = APIRouter()


@router.get("/items", response_model=list[InventoryItemRead])
async def list_items(
    category: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_inventory_items(db, current_user.restaurant_id, category, limit)


@router.post("/items", response_model=InventoryItemRead, status_code=201)
async def add_item(
    payload: InventoryItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_inventory_item(db, current_user.restaurant_id, payload)


@router.put("/items/{item_id}", response_model=InventoryItemRead)
async def edit_item(
    item_id: int,
    payload: InventoryItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_inventory_item(db, current_user.restaurant_id, item_id, payload)


@router.get("/orders", response_model=list[PurchaseOrderRead])
async def list_orders(
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_purchase_orders(db, current_user.restaurant_id, status, limit)


@router.post("/orders", response_model=PurchaseOrderRead, status_code=201)
async def add_order(
    payload: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_purchase_order(db, current_user.restaurant_id, payload)


@router.put("/orders/{order_id}", response_model=PurchaseOrderRead)
async def edit_order(
    order_id: int,
    payload: PurchaseOrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_purchase_order(db, current_user.restaurant_id, order_id, payload)


@router.post("/orders/{order_id}/receive", response_model=PurchaseOrderRead)
async def receive_order(
    order_id: int,
    payload: GoodsReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await receive_purchase_order(db, current_user.restaurant_id, order_id, payload)


@router.get("/vendors", response_model=list[VendorRead])
async def list_vendors(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_vendors(db, current_user.restaurant_id, active_only)


@router.post("/vendors", response_model=VendorRead, status_code=201)
async def add_vendor(
    payload: VendorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_vendor(db, current_user.restaurant_id, payload)


@router.put("/vendors/{vendor_id}", response_model=VendorRead)
async def edit_vendor(
    vendor_id: int,
    payload: VendorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_vendor(db, current_user.restaurant_id, vendor_id, payload)


@router.get("/vendors/{vendor_id}/catalog", response_model=list[SupplierCatalogItemRead])
async def vendor_catalog(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_vendor_catalog(db, current_user.restaurant_id, vendor_id)


@router.post("/vendors/{vendor_id}/catalog", response_model=SupplierCatalogItemRead, status_code=201)
async def add_vendor_catalog_item(
    vendor_id: int,
    payload: SupplierCatalogItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await add_catalog_item(db, current_user.restaurant_id, vendor_id, payload)


@router.get("/price-comparison")
async def price_comparison(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_price_comparison(db, current_user.restaurant_id, item_id)


@router.get("/auto-purchase-rules", response_model=list[AutoPurchaseRuleRead])
async def list_auto_purchase_rules(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_auto_purchase_rules(db, current_user.restaurant_id, active_only)


@router.post("/auto-purchase-rules", response_model=AutoPurchaseRuleRead, status_code=201)
async def add_auto_purchase_rule(
    payload: AutoPurchaseRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_auto_purchase_rule(db, current_user.restaurant_id, payload)


@router.put("/auto-purchase-rules/{rule_id}", response_model=AutoPurchaseRuleRead)
async def edit_auto_purchase_rule(
    rule_id: int,
    payload: AutoPurchaseRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_auto_purchase_rule(db, current_user.restaurant_id, rule_id, payload)


@router.delete("/auto-purchase-rules/{rule_id}", status_code=204)
async def remove_auto_purchase_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    await delete_auto_purchase_rule(db, current_user.restaurant_id, rule_id)


@router.get("/tva", response_model=list[TVAReportRead])
async def tva_report(
    period: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_tva_report(db, current_user.restaurant_id, period)


@router.get("/low-stock", response_model=list[InventoryItemRead])
async def low_stock(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_low_stock_items(db, current_user.restaurant_id)
