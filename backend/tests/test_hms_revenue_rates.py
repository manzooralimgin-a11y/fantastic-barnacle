from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import HotelProperty, RoomType


def _headers(property_id: int) -> dict[str, str]:
    return {
        "x-test-property-id": str(property_id),
        "x-test-hotel-property-ids": str(property_id),
        "x-test-hotel-permissions": "hotel.rate_management",
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_rate_season_plan_and_matrix_flow(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Revenue Hotel",
        address="River 10",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort Plus",
        base_occupancy=2,
        max_occupancy=4,
        base_price=149.0,
    )
    db_session.add(room_type)
    await db_session.commit()

    season_start = date.today()
    season_end = season_start + timedelta(days=6)
    season_response = await client.post(
        "/api/hms/pms/revenue/seasons",
        headers=_headers(property_record.id),
        params={"property_id": property_record.id},
        json={
            "name": "Spring Weekend",
            "start_date": season_start.isoformat(),
            "end_date": season_end.isoformat(),
            "color_hex": "#F59E0B",
            "is_active": True,
        },
    )
    assert season_response.status_code == 201
    season_payload = season_response.json()
    assert season_payload["name"] == "Spring Weekend"

    plan_response = await client.post(
        "/api/hms/pms/revenue/plans",
        headers=_headers(property_record.id),
        params={"property_id": property_record.id},
        json={
            "room_type_id": room_type.id,
            "code": "BAR_KPLUS",
            "name": "Best Available Rate",
            "currency": "EUR",
            "base_price": 159.0,
            "is_active": True,
        },
    )
    assert plan_response.status_code == 201
    plan_payload = plan_response.json()
    assert plan_payload["room_type_name"] == "Komfort Plus"
    assert plan_payload["base_price"] == 159.0

    matrix_dates = [season_start + timedelta(days=index) for index in range(3)]
    update_response = await client.put(
        f"/api/hms/pms/revenue/plans/{plan_payload['id']}/matrix",
        headers=_headers(property_record.id),
        json={
            "items": [
                {
                    "rate_date": matrix_dates[0].isoformat(),
                    "price": 179.0,
                    "closed": False,
                    "closed_to_arrival": False,
                    "closed_to_departure": False,
                    "min_stay": 2,
                    "max_stay": 5,
                    "notes": "Weekend minimum stay",
                },
                {
                    "rate_date": matrix_dates[1].isoformat(),
                    "price": 189.0,
                    "closed": True,
                    "closed_to_arrival": True,
                    "closed_to_departure": False,
                    "min_stay": None,
                    "max_stay": None,
                    "notes": "Closed for maintenance block",
                },
                {
                    "rate_date": matrix_dates[2].isoformat(),
                    "price": 169.0,
                    "closed": False,
                    "closed_to_arrival": False,
                    "closed_to_departure": True,
                    "min_stay": 1,
                    "max_stay": 3,
                    "notes": None,
                },
            ]
        },
    )
    assert update_response.status_code == 200
    matrix_payload = update_response.json()
    assert matrix_payload["plan"]["id"] == plan_payload["id"]
    assert len(matrix_payload["items"]) == 3
    assert matrix_payload["items"][0]["season_name"] == "Spring Weekend"
    assert matrix_payload["items"][0]["min_stay"] == 2
    assert matrix_payload["items"][1]["closed"] is True
    assert matrix_payload["items"][1]["closed_to_arrival"] is True
    assert matrix_payload["items"][2]["closed_to_departure"] is True

    fetch_response = await client.get(
        f"/api/hms/pms/revenue/plans/{plan_payload['id']}/matrix",
        headers=_headers(property_record.id),
        params={"start_date": season_start.isoformat(), "days": 3},
    )
    assert fetch_response.status_code == 200
    fetched_matrix = fetch_response.json()
    assert [item["price"] for item in fetched_matrix["items"]] == [179.0, 189.0, 169.0]

    overlapping_season_response = await client.post(
        "/api/hms/pms/revenue/seasons",
        headers=_headers(property_record.id),
        params={"property_id": property_record.id},
        json={
            "name": "Overlap",
            "start_date": (season_start + timedelta(days=2)).isoformat(),
            "end_date": (season_start + timedelta(days=4)).isoformat(),
            "is_active": True,
        },
    )
    assert overlapping_season_response.status_code == 409
