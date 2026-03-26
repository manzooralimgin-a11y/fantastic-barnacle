from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# ── QR Table Code ──
class QRTableCodeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    table_id: int
    code: str
    is_active: bool
    scan_count: int
    last_scanned_at: datetime | None
    created_at: datetime


class QRTableCodeCreate(BaseModel):
    table_id: int


# ── Public Table Info ──
class TableInfo(BaseModel):
    table_number: str
    section_name: str
    capacity: int


# ── Public Menu (simplified) ──
class PublicMenuItem(BaseModel):
    id: int
    name: str
    description: str | None
    price: float
    category_id: int
    category_name: str
    image_url: str | None
    is_available: bool
    prep_time_min: int
    allergens: list[str]
    dietary_tags: list[str]


class PublicMenuCategory(BaseModel):
    id: int
    name: str
    items: list[PublicMenuItem]


# ── Order Submission ──
class QROrderItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    menu_item_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=50)
    notes: str | None = Field(default=None, max_length=500)


class QROrderSubmit(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    table_code: str = Field(min_length=3, max_length=128)
    guest_name: str = Field(default="QR Guest", min_length=1, max_length=255)
    items: list[QROrderItem] = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)


class QROrderResponse(BaseModel):
    order_id: int
    table_number: str
    status: str
    items_count: int
    total: float
    message: str


class QROrderStatus(BaseModel):
    order_id: int
    status: str
    items: list[dict]
