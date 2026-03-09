"""Master data migration — runs on every deploy to ensure data exists.

Idempotent: safe to run multiple times. Checks for existing records before inserting.
Flow:
  1. Create default restaurant if none exists
  2. Create default admin user if none exists
  3. Seed menu categories + curated menu items
  4. Import gastronovi_raw_items.json as additional items
  5. Seed floor sections, tables, reservations
  6. Seed dashboard KPIs, agent actions
  7. Seed menu combos, modifiers
"""

import asyncio
import json
import os
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base
from app.auth.models import Restaurant, User, UserRole
from app.auth.utils import hash_password
from app.menu.models import MenuCategory, MenuItem, MenuModifier, MenuCombo
from app.reservations.models import FloorSection, Table, Reservation, WaitlistEntry
from app.dashboard.models import KPISnapshot, Alert
from app.core.models import AgentAction
from app.inventory.models import InventoryItem
from app.workforce.models import Employee


async def migrate_master():
    logs = []

    def log(msg):
        print(msg)
        logs.append(msg)

    log("Starting Master Data Migration...")

    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # =============================================================
        # 1. ENSURE DEFAULT RESTAURANT EXISTS
        # =============================================================
        result = await db.execute(select(Restaurant))
        restaurants = list(result.scalars().all())

        if not restaurants:
            log("[RESTAURANT] No restaurants found — creating default restaurant...")
            default_restaurant = Restaurant(
                name="Gestronomy Restaurant",
                address="Hauptstraße 1",
                city="Berlin",
                state="Berlin",
                zip_code="10115",
                phone="+49 30 1234567",
                timezone="Europe/Berlin",
                currency="EUR",
                settings_json={"theme": "default", "language": "de"},
            )
            db.add(default_restaurant)
            await db.flush()
            await db.refresh(default_restaurant)
            restaurants = [default_restaurant]
            log(f"[RESTAURANT] Created: {default_restaurant.name} (ID {default_restaurant.id})")
        else:
            log(f"[RESTAURANT] Found {len(restaurants)} existing restaurants.")

        # =============================================================
        # 2. ENSURE DEFAULT ADMIN USER EXISTS (with known credentials)
        # =============================================================
        admin_email = "admin@gestronomy.app"
        admin_password = "Gestronomy2024!"
        result = await db.execute(
            select(User).where(User.email == admin_email)
        )
        existing_admin = result.scalar_one_or_none()
        if not existing_admin:
            admin_user = User(
                email=admin_email,
                password_hash=hash_password(admin_password),
                full_name="Admin",
                role=UserRole.admin,
                restaurant_id=restaurants[0].id,
            )
            db.add(admin_user)
            await db.flush()
            log(f"[USER] Created admin: {admin_email}")
        else:
            # Always reset password to known value so login works after redeploy
            existing_admin.password_hash = hash_password(admin_password)
            existing_admin.role = UserRole.admin
            existing_admin.is_active = True
            existing_admin.restaurant_id = restaurants[0].id
            await db.flush()
            log(f"[USER] Admin user synced: {admin_email}")

        # =============================================================
        # 3. SEED PER-RESTAURANT DATA
        # =============================================================
        for restaurant in restaurants:
            rid = restaurant.id
            log(f"[SEED] Restaurant ID {rid} ({restaurant.name})")

            # ---------------------------------------------------------
            # 3a. MENU CATEGORIES (full set with proper icons/colors)
            # ---------------------------------------------------------
            categories_spec = [
                {"name": "Appetizers", "description": "Start your meal right", "icon": "appetizer", "color": "#f59e0b", "sort_order": 1},
                {"name": "Soups", "description": "Warm & comforting", "icon": "soup", "color": "#06b6d4", "sort_order": 2},
                {"name": "Salads", "description": "Fresh and healthy", "icon": "salad", "color": "#22c55e", "sort_order": 3},
                {"name": "Main Course", "description": "Chef's finest selections", "icon": "main", "color": "#e94560", "sort_order": 4},
                {"name": "Pasta", "description": "Italian classics", "icon": "pasta", "color": "#f97316", "sort_order": 5},
                {"name": "Seafood", "description": "Ocean to table", "icon": "seafood", "color": "#3b82f6", "sort_order": 6},
                {"name": "Desserts", "description": "Sweet endings", "icon": "dessert", "color": "#ec4899", "sort_order": 7},
                {"name": "Beverages", "description": "Drinks & cocktails", "icon": "beverage", "color": "#8b5cf6", "sort_order": 8},
                {"name": "General", "description": "Imported items", "icon": "menu", "color": "#6366f1", "sort_order": 9},
            ]

            cat_map = {}
            for spec in categories_spec:
                res = await db.execute(
                    select(MenuCategory).where(
                        MenuCategory.restaurant_id == rid,
                        MenuCategory.name == spec["name"],
                    )
                )
                existing = res.scalar_one_or_none()
                if not existing:
                    new_cat = MenuCategory(restaurant_id=rid, **spec)
                    db.add(new_cat)
                    await db.flush()
                    cat_map[spec["name"]] = new_cat.id
                else:
                    cat_map[spec["name"]] = existing.id

            log(f"  [MENU] Categories ready ({len(cat_map)} total)")

            # ---------------------------------------------------------
            # 3b. CURATED MENU ITEMS (rich data with descriptions, allergens, dietary tags)
            # ---------------------------------------------------------
            curated_items = [
                # Appetizers
                {"cat": "Appetizers", "name": "Bruschetta al Pomodoro", "description": "Toasted ciabatta with fresh tomatoes, basil, and garlic", "price": 9.50, "cost": 2.80, "prep_time_min": 8, "is_featured": True, "dietary_tags_json": {"tags": ["Vegetarian"]}, "allergens_json": {"tags": ["Gluten"]}},
                {"cat": "Appetizers", "name": "Carpaccio di Manzo", "description": "Thinly sliced beef with arugula, parmesan, and truffle oil", "price": 14.00, "cost": 5.50, "prep_time_min": 10, "allergens_json": {"tags": ["Dairy"]}},
                {"cat": "Appetizers", "name": "Calamari Fritti", "description": "Crispy fried squid with lemon aioli", "price": 12.00, "cost": 4.00, "prep_time_min": 10},
                {"cat": "Appetizers", "name": "Burrata e Prosciutto", "description": "Creamy burrata with prosciutto di parma and figs", "price": 16.00, "cost": 7.00, "prep_time_min": 5, "is_featured": True, "allergens_json": {"tags": ["Dairy"]}},
                # Soups
                {"cat": "Soups", "name": "French Onion Soup", "description": "Classic onion soup with gruyere crouton", "price": 10.00, "cost": 2.50, "prep_time_min": 12, "allergens_json": {"tags": ["Gluten", "Dairy"]}},
                {"cat": "Soups", "name": "Lobster Bisque", "description": "Rich & creamy lobster soup with cognac", "price": 14.00, "cost": 5.00, "prep_time_min": 10, "is_featured": True, "allergens_json": {"tags": ["Shellfish", "Dairy"]}},
                # Salads
                {"cat": "Salads", "name": "Caesar Salad", "description": "Romaine, parmesan, croutons, classic dressing", "price": 11.00, "cost": 3.00, "prep_time_min": 7, "dietary_tags_json": {"tags": ["Gluten-Free Option"]}},
                {"cat": "Salads", "name": "Nicoise Salad", "description": "Tuna, olives, egg, green beans, potatoes", "price": 15.00, "cost": 5.00, "prep_time_min": 10},
                {"cat": "Salads", "name": "Quinoa & Avocado Bowl", "description": "Quinoa, avocado, cherry tomatoes, lime dressing", "price": 13.00, "cost": 4.00, "prep_time_min": 8, "dietary_tags_json": {"tags": ["Vegan", "Gluten-Free"]}},
                # Main Course
                {"cat": "Main Course", "name": "Beef Tenderloin", "description": "8oz tenderloin, red wine jus, roasted vegetables", "price": 34.00, "cost": 14.00, "prep_time_min": 25, "is_featured": True, "allergens_json": {"tags": ["Dairy"]}},
                {"cat": "Main Course", "name": "Duck Confit", "description": "Slow-cooked duck leg, lentils, orange glaze", "price": 28.00, "cost": 10.00, "prep_time_min": 20},
                {"cat": "Main Course", "name": "Lamb Rack", "description": "Herb-crusted rack of lamb with mint pesto", "price": 36.00, "cost": 15.00, "prep_time_min": 25, "is_featured": True},
                {"cat": "Main Course", "name": "Pan-Seared Chicken", "description": "Free-range chicken, mushroom risotto, truffle jus", "price": 24.00, "cost": 8.00, "prep_time_min": 20},
                {"cat": "Main Course", "name": "Vegetable Wellington", "description": "Seasonal vegetables in puff pastry, mushroom duxelles", "price": 22.00, "cost": 7.00, "prep_time_min": 20, "dietary_tags_json": {"tags": ["Vegetarian"]}},
                # Pasta
                {"cat": "Pasta", "name": "Truffle Tagliatelle", "description": "Fresh pasta, black truffle, parmesan cream", "price": 24.00, "cost": 8.00, "prep_time_min": 15, "is_featured": True, "allergens_json": {"tags": ["Gluten", "Dairy"]}},
                {"cat": "Pasta", "name": "Spaghetti Carbonara", "description": "Guanciale, pecorino, egg yolk, black pepper", "price": 18.00, "cost": 5.00, "prep_time_min": 12, "allergens_json": {"tags": ["Gluten", "Dairy", "Eggs"]}},
                {"cat": "Pasta", "name": "Penne Arrabbiata", "description": "Spicy tomato sauce, garlic, chili flakes", "price": 16.00, "cost": 3.50, "prep_time_min": 12, "dietary_tags_json": {"tags": ["Vegan"]}, "allergens_json": {"tags": ["Gluten"]}},
                {"cat": "Pasta", "name": "Lobster Linguine", "description": "Half lobster, cherry tomatoes, white wine sauce", "price": 32.00, "cost": 14.00, "prep_time_min": 18, "allergens_json": {"tags": ["Shellfish", "Gluten"]}},
                # Seafood
                {"cat": "Seafood", "name": "Grilled Sea Bass", "description": "Whole sea bass, lemon butter, capers", "price": 30.00, "cost": 12.00, "prep_time_min": 20, "is_featured": True},
                {"cat": "Seafood", "name": "Salmon Fillet", "description": "Atlantic salmon, dill cream, roasted asparagus", "price": 26.00, "cost": 9.00, "prep_time_min": 18, "dietary_tags_json": {"tags": ["Gluten-Free"]}},
                {"cat": "Seafood", "name": "Seafood Platter", "description": "Oysters, prawns, crab, lobster tail", "price": 55.00, "cost": 25.00, "prep_time_min": 15, "allergens_json": {"tags": ["Shellfish"]}},
                # Desserts
                {"cat": "Desserts", "name": "Tiramisu", "description": "Classic Italian mascarpone & espresso dessert", "price": 10.00, "cost": 3.00, "prep_time_min": 5, "allergens_json": {"tags": ["Dairy", "Eggs", "Gluten"]}},
                {"cat": "Desserts", "name": "Creme Brulee", "description": "Tahitian vanilla bean, caramelized sugar", "price": 11.00, "cost": 2.50, "prep_time_min": 5, "is_featured": True, "allergens_json": {"tags": ["Dairy", "Eggs"]}},
                {"cat": "Desserts", "name": "Chocolate Fondant", "description": "Warm chocolate lava cake, vanilla ice cream", "price": 12.00, "cost": 3.50, "prep_time_min": 12, "allergens_json": {"tags": ["Dairy", "Eggs", "Gluten"]}},
                {"cat": "Desserts", "name": "Lemon Tart", "description": "Tangy lemon curd, meringue, berry coulis", "price": 10.00, "cost": 2.50, "prep_time_min": 5, "dietary_tags_json": {"tags": ["Vegetarian"]}},
                {"cat": "Desserts", "name": "Sorbet Selection", "description": "Three scoops: mango, raspberry, passion fruit", "price": 8.00, "cost": 2.00, "prep_time_min": 3, "dietary_tags_json": {"tags": ["Vegan", "Gluten-Free"]}},
                # Beverages
                {"cat": "Beverages", "name": "Espresso", "description": "Double shot Italian espresso", "price": 3.50, "cost": 0.50, "prep_time_min": 2},
                {"cat": "Beverages", "name": "Fresh Orange Juice", "description": "Freshly squeezed daily", "price": 5.00, "cost": 1.50, "prep_time_min": 3, "dietary_tags_json": {"tags": ["Vegan", "Gluten-Free"]}},
                {"cat": "Beverages", "name": "Sparkling Water", "description": "San Pellegrino 750ml", "price": 4.50, "cost": 1.00, "prep_time_min": 1},
                {"cat": "Beverages", "name": "House Red Wine", "description": "Glass of Cotes du Rhone", "price": 8.00, "cost": 2.50, "prep_time_min": 1},
                {"cat": "Beverages", "name": "Cocktail - Negroni", "description": "Gin, Campari, sweet vermouth", "price": 12.00, "cost": 3.00, "prep_time_min": 5},
            ]

            curated_count = 0
            for item_spec in curated_items:
                cat_name = item_spec.pop("cat")
                category_id = cat_map.get(cat_name)
                if not category_id:
                    continue
                res = await db.execute(
                    select(MenuItem).where(
                        MenuItem.restaurant_id == rid,
                        MenuItem.name == item_spec["name"],
                    )
                )
                if not res.scalar_one_or_none():
                    db.add(MenuItem(restaurant_id=rid, category_id=category_id, **item_spec))
                    curated_count += 1
                # Restore cat key for next restaurant iteration
                item_spec["cat"] = cat_name

            log(f"  [MENU] Curated items: {curated_count} added")

            # ---------------------------------------------------------
            # 3c. IMPORT GASTRONOVI RAW ITEMS (additional items)
            # ---------------------------------------------------------
            base_dir = os.path.dirname(__file__)
            json_path = os.path.join(base_dir, "data", "gastronovi_raw_items.json")
            if not os.path.exists(json_path):
                json_path = os.path.join(base_dir, "..", "data", "gastronovi_raw_items.json")

            if os.path.exists(json_path):
                with open(json_path, "r", encoding="utf-8") as f:
                    raw_items = json.load(f)

                imported_count = 0
                for item in raw_items:
                    if float(item.get("price", 0)) <= 0:
                        continue  # Skip zero-price placeholders
                    res = await db.execute(
                        select(MenuItem).where(
                            MenuItem.restaurant_id == rid,
                            MenuItem.name == item["title"],
                        )
                    )
                    if not res.scalar_one_or_none():
                        db.add(MenuItem(
                            restaurant_id=rid,
                            category_id=cat_map["General"],
                            name=item["title"],
                            price=float(item["price"]),
                            cost=float(item["price"]) * 0.3,
                        ))
                        imported_count += 1
                log(f"  [MENU] Gastronovi import: {imported_count} added")
            else:
                log(f"  [MENU] gastronovi_raw_items.json not found — skipped")

            # ---------------------------------------------------------
            # 3d. MENU MODIFIERS
            # ---------------------------------------------------------
            modifiers_spec = [
                {"name": "Extra Cheese", "group_name": "Additions", "price_adjustment": 2.00},
                {"name": "Truffle Oil", "group_name": "Additions", "price_adjustment": 4.00},
                {"name": "Side Salad", "group_name": "Sides", "price_adjustment": 3.50},
                {"name": "Fries", "group_name": "Sides", "price_adjustment": 3.00},
                {"name": "Gluten-Free Bread", "group_name": "Dietary", "price_adjustment": 1.50},
                {"name": "Extra Spicy", "group_name": "Cooking", "price_adjustment": 0},
                {"name": "Well Done", "group_name": "Cooking", "price_adjustment": 0},
                {"name": "Medium Rare", "group_name": "Cooking", "price_adjustment": 0, "is_default": True},
            ]
            mod_count = 0
            for m in modifiers_spec:
                res = await db.execute(
                    select(MenuModifier).where(
                        MenuModifier.restaurant_id == rid,
                        MenuModifier.name == m["name"],
                    )
                )
                if not res.scalar_one_or_none():
                    db.add(MenuModifier(restaurant_id=rid, **m))
                    mod_count += 1
            if mod_count:
                log(f"  [MENU] Modifiers: {mod_count} added")

            # ---------------------------------------------------------
            # 3e. MENU COMBOS
            # ---------------------------------------------------------
            combos_spec = [
                {"name": "Lunch Special", "description": "Appetizer + Main + Dessert", "combo_price": 29.90, "items_json": {"appetizer": "Any appetizer", "main": "Any main course", "dessert": "Any dessert"}, "savings_amount": 8.00},
                {"name": "Seafood Feast", "description": "Seafood platter + Sea bass + Wine", "combo_price": 79.90, "items_json": {"starter": "Seafood Platter", "main": "Grilled Sea Bass", "wine": "Bottle of white wine"}, "savings_amount": 15.00},
            ]
            combo_count = 0
            for c in combos_spec:
                res = await db.execute(
                    select(MenuCombo).where(
                        MenuCombo.restaurant_id == rid,
                        MenuCombo.name == c["name"],
                    )
                )
                if not res.scalar_one_or_none():
                    db.add(MenuCombo(restaurant_id=rid, **c))
                    combo_count += 1
            if combo_count:
                log(f"  [MENU] Combos: {combo_count} added")

            # ---------------------------------------------------------
            # 3f. FLOOR SECTIONS & TABLES
            # ---------------------------------------------------------
            sections_data = [
                {"name": "Main Dining", "description": "Main indoor dining area", "sort_order": 1},
                {"name": "Terrace", "description": "Outdoor seating area", "sort_order": 2},
                {"name": "Private Room", "description": "Private dining for groups", "sort_order": 3},
                {"name": "Bar Area", "description": "Bar counter & high tables", "sort_order": 4},
            ]

            sec_map = {}
            for s in sections_data:
                res = await db.execute(
                    select(FloorSection).where(
                        FloorSection.restaurant_id == rid,
                        FloorSection.name == s["name"],
                    )
                )
                existing = res.scalar_one_or_none()
                if not existing:
                    new_sec = FloorSection(restaurant_id=rid, **s)
                    db.add(new_sec)
                    await db.flush()
                    sec_map[s["name"]] = new_sec.id
                else:
                    sec_map[s["name"]] = existing.id

            tables_data = [
                # Main Dining
                {"section_id": sec_map.get("Main Dining"), "table_number": "M1", "capacity": 2, "min_capacity": 1, "shape": "square", "position_x": 1, "position_y": 1},
                {"section_id": sec_map.get("Main Dining"), "table_number": "M2", "capacity": 2, "min_capacity": 1, "shape": "square", "position_x": 2, "position_y": 1},
                {"section_id": sec_map.get("Main Dining"), "table_number": "M3", "capacity": 4, "min_capacity": 2, "shape": "square", "position_x": 3, "position_y": 1},
                {"section_id": sec_map.get("Main Dining"), "table_number": "M4", "capacity": 4, "min_capacity": 2, "shape": "round", "position_x": 1, "position_y": 2},
                {"section_id": sec_map.get("Main Dining"), "table_number": "M5", "capacity": 6, "min_capacity": 3, "shape": "rectangle", "position_x": 2, "position_y": 2},
                {"section_id": sec_map.get("Main Dining"), "table_number": "M6", "capacity": 6, "min_capacity": 3, "shape": "rectangle", "position_x": 3, "position_y": 2},
                # Terrace
                {"section_id": sec_map.get("Terrace"), "table_number": "T1", "capacity": 2, "min_capacity": 1, "shape": "round", "position_x": 1, "position_y": 1},
                {"section_id": sec_map.get("Terrace"), "table_number": "T2", "capacity": 2, "min_capacity": 1, "shape": "round", "position_x": 2, "position_y": 1},
                {"section_id": sec_map.get("Terrace"), "table_number": "T3", "capacity": 4, "min_capacity": 2, "shape": "square", "position_x": 3, "position_y": 1},
                {"section_id": sec_map.get("Terrace"), "table_number": "T4", "capacity": 4, "min_capacity": 2, "shape": "square", "position_x": 1, "position_y": 2},
                # Private Room
                {"section_id": sec_map.get("Private Room"), "table_number": "P1", "capacity": 8, "min_capacity": 4, "shape": "rectangle", "position_x": 1, "position_y": 1},
                {"section_id": sec_map.get("Private Room"), "table_number": "P2", "capacity": 12, "min_capacity": 6, "shape": "rectangle", "position_x": 2, "position_y": 1},
                # Bar Area
                {"section_id": sec_map.get("Bar Area"), "table_number": "B1", "capacity": 2, "min_capacity": 1, "shape": "round", "position_x": 1, "position_y": 1},
                {"section_id": sec_map.get("Bar Area"), "table_number": "B2", "capacity": 2, "min_capacity": 1, "shape": "round", "position_x": 2, "position_y": 1},
                {"section_id": sec_map.get("Bar Area"), "table_number": "B3", "capacity": 4, "min_capacity": 2, "shape": "square", "position_x": 3, "position_y": 1},
            ]

            table_count = 0
            table_objs = []
            for t in tables_data:
                if not t.get("section_id"):
                    continue
                res = await db.execute(
                    select(Table).where(
                        Table.restaurant_id == rid,
                        Table.table_number == t["table_number"],
                    )
                )
                existing = res.scalar_one_or_none()
                if not existing:
                    new_table = Table(restaurant_id=rid, **t)
                    db.add(new_table)
                    await db.flush()
                    table_objs.append(new_table)
                    table_count += 1
                else:
                    table_objs.append(existing)

            log(f"  [SEATING] {len(sec_map)} sections, {table_count} new tables")

            # ---------------------------------------------------------
            # 3g. RESERVATIONS
            # ---------------------------------------------------------
            res = await db.execute(
                select(Reservation).where(Reservation.restaurant_id == rid).limit(1)
            )
            if not res.scalar_one_or_none():
                today = date.today()
                tomorrow = today + timedelta(days=1)
                reservations_data = [
                    {"guest_name": "Sophie Martin", "guest_phone": "+33612345678", "guest_email": "sophie@email.com", "party_size": 3, "reservation_date": today, "start_time": time(12, 0), "duration_min": 90, "status": "completed", "source": "online"},
                    {"guest_name": "Pierre Dupont", "guest_phone": "+33698765432", "party_size": 5, "reservation_date": today, "start_time": time(19, 0), "duration_min": 120, "status": "confirmed", "source": "phone", "special_requests": "Anniversary dinner"},
                    {"guest_name": "Jean-Luc Bernard", "guest_phone": "+33611223344", "party_size": 4, "reservation_date": today, "start_time": time(19, 30), "duration_min": 90, "status": "confirmed", "source": "phone"},
                    {"guest_name": "Marie Leclerc", "guest_email": "marie.l@email.com", "party_size": 2, "reservation_date": today, "start_time": time(20, 0), "duration_min": 90, "status": "confirmed", "source": "online", "special_requests": "Window seat preferred"},
                    {"guest_name": "Carlos Rodriguez", "guest_phone": "+33699887766", "party_size": 8, "reservation_date": today, "start_time": time(20, 30), "duration_min": 150, "status": "confirmed", "source": "phone"},
                    {"guest_name": "Anna Schmidt", "guest_phone": "+33644556677", "party_size": 6, "reservation_date": tomorrow, "start_time": time(19, 0), "duration_min": 120, "status": "confirmed", "source": "online"},
                    {"guest_name": "Yuki Tanaka", "guest_email": "yuki@email.com", "party_size": 2, "reservation_date": tomorrow, "start_time": time(12, 30), "duration_min": 90, "status": "confirmed", "source": "online", "special_requests": "Vegetarian menu only"},
                ]
                for r in reservations_data:
                    db.add(Reservation(restaurant_id=rid, **r))
                log(f"  [RESERVATIONS] {len(reservations_data)} seeded")

            # ---------------------------------------------------------
            # 3h. WAITLIST
            # ---------------------------------------------------------
            res = await db.execute(
                select(WaitlistEntry).where(WaitlistEntry.restaurant_id == rid).limit(1)
            )
            if not res.scalar_one_or_none():
                now = datetime.now(timezone.utc)
                db.add(WaitlistEntry(restaurant_id=rid, guest_name="Thomas Moreau", guest_phone="+33677889900", party_size=3, estimated_wait_min=20, check_in_time=now - timedelta(minutes=10)))
                db.add(WaitlistEntry(restaurant_id=rid, guest_name="Elena Rossi", guest_phone="+33655443322", party_size=2, estimated_wait_min=10, check_in_time=now - timedelta(minutes=5)))
                log(f"  [WAITLIST] 2 entries seeded")

            # ---------------------------------------------------------
            # 3i. DASHBOARD KPIs
            # ---------------------------------------------------------
            now = datetime.now(timezone.utc)
            res = await db.execute(select(KPISnapshot).limit(1))
            if not res.scalar_one_or_none():
                kpi_data = [
                    {"metric_name": "total_sales", "value": 12847.50, "previous_value": 11920.00, "target_value": 13000.00},
                    {"metric_name": "labor_pct", "value": 28.5, "previous_value": 30.2, "target_value": 27.0},
                    {"metric_name": "food_cost_pct", "value": 31.2, "previous_value": 32.8, "target_value": 30.0},
                    {"metric_name": "guest_count", "value": 187, "previous_value": 172, "target_value": 200},
                    {"metric_name": "avg_ticket", "value": 68.70, "previous_value": 69.30, "target_value": 65.00},
                    {"metric_name": "table_turnover", "value": 2.8, "previous_value": 2.5, "target_value": 3.0},
                ]
                for k in kpi_data:
                    db.add(KPISnapshot(**k, timestamp=now))
                log(f"  [KPI] {len(kpi_data)} snapshots seeded")

            # ---------------------------------------------------------
            # 3j. AGENT ACTIONS
            # ---------------------------------------------------------
            res = await db.execute(select(AgentAction).limit(1))
            if not res.scalar_one_or_none():
                actions = [
                    {"agent_name": "InventoryAgent", "action_type": "auto_order", "description": "Auto-ordered 10kg Salmon Fillet", "status": "completed"},
                    {"agent_name": "FinanceAgent", "action_type": "analysis", "description": "Daily P&L report generated", "status": "completed"},
                    {"agent_name": "WorkforceAgent", "action_type": "schedule", "description": "Generated next week schedule", "status": "completed"},
                    {"agent_name": "ForecastAgent", "action_type": "prediction", "description": "Weekend demand forecast updated", "status": "completed"},
                ]
                for a in actions:
                    db.add(AgentAction(**a, confidence=0.95, input_data={}, output_data={}))
                log(f"  [AGENTS] {len(actions)} actions seeded")

        await db.commit()
        log("Master Migration Complete!")

    await engine.dispose()
    return logs


if __name__ == "__main__":
    asyncio.run(migrate_master())
