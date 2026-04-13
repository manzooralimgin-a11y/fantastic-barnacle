from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class GuestProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    salutation: str | None = None
    birthday: date | None = None
    country_code: str | None = None
    country_name: str | None = None
    custom_fields_json: dict | None = None
    dietary_json: dict | None = None
    flavor_profile_json: dict | None = None
    clv: float
    churn_risk_score: float
    visit_count: int
    last_visit: datetime | None = None
    created_at: datetime
    updated_at: datetime


class GuestCreate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    salutation: str | None = None
    birthday: date | None = None
    country_code: str | None = None
    country_name: str | None = None
    custom_fields_json: dict | None = None
    dietary_json: dict | None = None
    flavor_profile_json: dict | None = None


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    guest_id: int | None = None
    order_date: datetime
    channel: str
    total: float
    items_json: dict
    discount: float
    tip: float
    created_at: datetime
    updated_at: datetime


class OrderCreate(BaseModel):
    guest_id: int | None = None
    order_date: datetime
    channel: str = "dine_in"
    total: float
    items_json: dict
    discount: float = 0
    tip: float = 0


class LoyaltyAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    guest_id: int
    tier: str
    points: int
    rewards_json: dict | None = None
    created_at: datetime
    updated_at: datetime


class PromotionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    guest_id: int | None = None
    type: str
    offer: str
    status: str
    sent_at: datetime | None = None
    redeemed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PromotionCreate(BaseModel):
    guest_id: int | None = None
    type: str
    offer: str
