#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root / "backend"))

    from app.config import settings  # noqa: WPS433

    engine = create_engine(settings.database_url_sync)
    with engine.connect() as conn:
        restaurant = conn.execute(
            text(
                """
                select id, name
                from restaurants
                order by id asc
                limit 1
                """
            )
        ).mappings().first()
        property_row = conn.execute(
            text(
                """
                select id, name
                from hms_properties
                order by id asc
                limit 1
                """
            )
        ).mappings().first()

    if restaurant is None:
        raise SystemExit("No restaurant record found in local database.")
    if property_row is None:
        raise SystemExit("No hotel property record found in local database.")

    payload = {
        "restaurant_id": int(restaurant["id"]),
        "restaurant_name": restaurant["name"],
        "property_id": int(property_row["id"]),
        "property_name": property_row["name"],
        "admin_email": os.environ.get("LOCAL_ADMIN_EMAIL", "local-admin@gestronomy.app"),
        "admin_password": os.environ.get("LOCAL_ADMIN_PASSWORD", "LocalAdmin1234!"),
        "backend_url": os.environ.get("LOCAL_BACKEND_URL", "http://localhost:8000"),
        "hotel_url": os.environ.get("LOCAL_HOTEL_URL", "http://localhost:3000"),
        "frontend_url": os.environ.get("LOCAL_FRONTEND_URL", "http://localhost:3001"),
        "restaurant_url": os.environ.get("LOCAL_RESTAURANT_URL", "http://localhost:3002"),
        "mcp_url": os.environ.get("LOCAL_MCP_URL", "http://localhost:8000/mcp/voicebooker/"),
    }
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
