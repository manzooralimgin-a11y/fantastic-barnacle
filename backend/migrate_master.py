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
from app.hms.models import HotelProperty, RoomType, Room, HotelReservation


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
            log(f"[USER] Verified admin: {admin_email}")
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
                {"name": "Soups & Starters", "description": "Soups and Starters", "icon": "soup", "color": "#06b6d4", "sort_order": 1},
                {"name": "Main Dishes", "description": "Winter Specials", "icon": "main", "color": "#e94560", "sort_order": 2},
                {"name": "Mittagskarte", "description": "Lunch Menu", "icon": "menu", "color": "#f97316", "sort_order": 3},
                {"name": "Indian Dishes", "description": "Indian Classics", "icon": "menu", "color": "#f59e0b", "sort_order": 4},
                {"name": "Bowls", "description": "À la carte", "icon": "salad", "color": "#22c55e", "sort_order": 5},
                {"name": "Desserts", "description": "Sweet endings", "icon": "dessert", "color": "#ec4899", "sort_order": 6},
                {"name": "Drinks", "description": "Champagne & Longdrinks", "icon": "beverage", "color": "#8b5cf6", "sort_order": 7},
                {"name": "Wine", "description": "White & Red Wines", "icon": "beverage", "color": "#8b5cf6", "sort_order": 8},
                {"name": "Digestif", "description": "Spirits & Digestifs", "icon": "beverage", "color": "#8b5cf6", "sort_order": 9},
                {"name": "Beer", "description": "Draft & Bottles", "icon": "beverage", "color": "#8b5cf6", "sort_order": 10},
                {"name": "Softdrinks", "description": "Water, Kola & Juices", "icon": "beverage", "color": "#8b5cf6", "sort_order": 11},
                {"name": "Smoothies & Shakes", "description": "Singh Laly's Specials", "icon": "beverage", "color": "#8b5cf6", "sort_order": 12},
                {"name": "Cocktails", "description": "Cocktails & Mocktails", "icon": "beverage", "color": "#8b5cf6", "sort_order": 13},
                {"name": "Global Glow", "description": "Fusion Cuisine", "icon": "main", "color": "#e94560", "sort_order": 14},
                {"name": "The Warm-Up!", "description": "Appetizers & Dips", "icon": "appetizer", "color": "#f59e0b", "sort_order": 15},
                {"name": "Es wird Ernst...", "description": "Main Courses", "icon": "main", "color": "#e94560", "sort_order": 16},
                {"name": "Singh Laly Signature Dishes", "description": "Chef's Specials", "icon": "main", "color": "#e94560", "sort_order": 17},
                {"name": "Küche der 1000 Aromen", "description": "Curries & Spices", "icon": "menu", "color": "#f59e0b", "sort_order": 18},
                {"name": "End Game!", "description": "Premium Desserts", "icon": "dessert", "color": "#ec4899", "sort_order": 19},
                {"name": "Kuchenglück & Kugelliebe", "description": "Cake & Ice Cream", "icon": "dessert", "color": "#ec4899", "sort_order": 20},
                {"name": "Hot Drinks", "description": "Coffee & Tea", "icon": "beverage", "color": "#8b5cf6", "sort_order": 21},
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
            # 3b. CURATED MENU ITEMS (Winterkarte Data)
            # ---------------------------------------------------------
            curated_items = [
                # Soups & Starters
                {"cat": "Soups & Starters", "name": "Samtige Kürbiscremesuppe", "description": "Vegan/vegetarian, with pumpkin seed oil & roasted pumpkin seeds", "price": 15.90, "cost": 4.50},
                {"cat": "Soups & Starters", "name": "Cremige Kartoffelrahmsuppe", "description": "With fresh herbs", "price": 14.90, "cost": 4.00},
                {"cat": "Soups & Starters", "name": "Rindertartar", "description": "With quail egg & toasted bread", "price": 19.90, "cost": 6.00},
                {"cat": "Soups & Starters", "name": "Gerösteter Chicorée-Salat", "description": "With crispy bacon, mild honey & walnuts", "price": 14.90, "cost": 4.50},
                {"cat": "Soups & Starters", "name": "Knusprige Bruschetta", "description": "With sautéed wild mushrooms & onion chutney", "price": 14.90, "cost": 4.00},
            
                # Main Dishes
                {"cat": "Main Dishes", "name": "Zartes Entenbrustfilet", "description": "Orange gravy, pistachio dumplings & caramelized wild broccoli", "price": 29.90, "cost": 10.00},
                {"cat": "Main Dishes", "name": "Zart gebratener Rehrücken", "description": "Gravy, caramelized wild broccoli & celery-potato purée", "price": 34.90, "cost": 12.00},
                {"cat": "Main Dishes", "name": "Zart geschmortes Rehgulasch", "description": "With serviette dumpling & apple red cabbage", "price": 24.90, "cost": 8.00},
                {"cat": "Main Dishes", "name": "Knusprig gebratenes Zanderfilet", "description": "With saffron risotto & green asparagus", "price": 29.90, "cost": 9.00},
                {"cat": "Main Dishes", "name": "Goldbraun knusprig gebratenes Lachsfilet", "description": "On lemon-herb quinoa & glazed vegetables", "price": 29.90, "cost": 9.00},
            
                # Mittagskarte
                {"cat": "Mittagskarte", "name": "Tomatencremesuppe", "description": "", "price": 9.90, "cost": 3.00},
                {"cat": "Mittagskarte", "name": "Gegrillte Dorade (Sizilianische Art)", "description": "With cherry tomatoes, chili, olives, peppers & baby potatoes", "price": 24.90, "cost": 8.00},
                {"cat": "Mittagskarte", "name": "Hausgemachte Rinderroulade", "description": "With gravy & mashed potatoes", "price": 14.90, "cost": 5.00},
                {"cat": "Mittagskarte", "name": "Gegrillte Rinderleber", "description": "With onions, apple pieces & mashed potatoes", "price": 12.90, "cost": 4.50},
                {"cat": "Mittagskarte", "name": "Mexikanische Pfanne", "description": "Mixed meats, corn, kidney beans, peppers & basmati rice", "price": 13.90, "cost": 5.00},
                {"cat": "Mittagskarte", "name": "Tango Mango", "description": "Chicken fillet with mango curry sauce & basmati rice", "price": 13.90, "cost": 4.50},
            
                # Indian Dishes
                {"cat": "Indian Dishes", "name": "Indische Linsensuppe", "description": "", "price": 9.90, "cost": 3.00},
                {"cat": "Indian Dishes", "name": "Sabzi Pachrangi", "description": "Mixed vegetables, potatoes, curry sauce, cashews & raisins (vegetarian/vegan)", "price": 19.90, "cost": 6.00},
                {"cat": "Indian Dishes", "name": "Aloo Gobi", "description": "Cauliflower & potatoes in curry sauce (vegetarian/vegan)", "price": 19.90, "cost": 6.00},
                {"cat": "Indian Dishes", "name": "Veggie/Vegan Curry", "description": "", "price": 19.90, "cost": 6.00},
                {"cat": "Indian Dishes", "name": "Butter Chicken", "description": "", "price": 22.90, "cost": 8.00},
                {"cat": "Indian Dishes", "name": "Chicken Spinaci", "description": "", "price": 19.90, "cost": 7.00},
                {"cat": "Indian Dishes", "name": "Chili Chicken", "description": "", "price": 19.90, "cost": 7.00},
                {"cat": "Indian Dishes", "name": "Lemon Chicken", "description": "", "price": 19.90, "cost": 7.00},
                {"cat": "Indian Dishes", "name": "Kürbis Kokos Curry (with shrimp)", "description": "", "price": 24.90, "cost": 9.00},
            
                # Bowls
                {"cat": "Bowls", "name": "Veggie Bowl", "description": "Cucumber, cherry tomatoes, chickpeas, feta, olives, salad, yogurt sauce", "price": 15.90, "cost": 5.00},
                {"cat": "Bowls", "name": "Indische Bowl", "description": "Marinated chicken, mango, rice, salad, yogurt-mint sauce", "price": 18.90, "cost": 6.00},
            
                # Desserts
                {"cat": "Desserts", "name": "Crème Brûlée", "description": "Tonka bean & walnut ice cream", "price": 14.90, "cost": 4.50},
                {"cat": "Desserts", "name": "Hausgemachter Kaiserschmarrn", "description": "With apple purée or red fruit compote", "price": 14.90, "cost": 4.50},
                {"cat": "Desserts", "name": "Cheesecake mit Sahne", "description": "", "price": 9.90, "cost": 3.00},
                {"cat": "Desserts", "name": "Dubai Pancakes", "description": "", "price": 13.90, "cost": 4.00},
                {"cat": "Desserts", "name": "Dubai Schokolade (100g)", "description": "", "price": 9.90, "cost": 3.00},
                {"cat": "Desserts", "name": "Kaiserschmarrn mit Apfelmus", "description": "", "price": 13.90, "cost": 4.00},
            
                # Drinks - Champagne & Aperitifs
                {"cat": "Drinks", "name": "Moët & Chandon Impérial (0,75l)", "description": "", "price": 99.00, "cost": 50.00},
                {"cat": "Drinks", "name": "Moët & Chandon Rosé Impérial", "description": "", "price": 129.00, "cost": 65.00},
                {"cat": "Drinks", "name": "Moët & Chandon Ice Impérial Rosé", "description": "", "price": 129.00, "cost": 65.00},
                {"cat": "Drinks", "name": "Dom Pérignon Vintage 2010", "description": "", "price": 250.00, "cost": 125.00},
                {"cat": "Drinks", "name": "Hennessy Cognac X.O (4cl)", "description": "", "price": 15.00, "cost": 5.00},
                {"cat": "Drinks", "name": "Glass Sekt", "description": "", "price": 4.90, "cost": 1.50},
                {"cat": "Drinks", "name": "Sherry", "description": "", "price": 4.90, "cost": 1.50},
                {"cat": "Drinks", "name": "Martini", "description": "", "price": 7.90, "cost": 2.50},
                {"cat": "Drinks", "name": "Hugo 'Elb'", "description": "", "price": 8.90, "cost": 2.50},
                {"cat": "Drinks", "name": "Batida", "description": "", "price": 9.90, "cost": 3.00},
                
                # Drinks - Spritz
                {"cat": "Drinks", "name": "Crodino Spritz (non-alcoholic)", "description": "", "price": 7.90, "cost": 2.50},
                {"cat": "Drinks", "name": "Campari Spritz", "description": "", "price": 9.90, "cost": 3.00},
                {"cat": "Drinks", "name": "Aperol Spritz", "description": "", "price": 8.90, "cost": 2.50},
                {"cat": "Drinks", "name": "Sarti Lemon Spritz", "description": "", "price": 9.90, "cost": 3.00},
                {"cat": "Drinks", "name": "Sarti Spritz", "description": "", "price": 9.90, "cost": 3.00},
            
                # Wine
                {"cat": "Wine", "name": "Costaross Prosecco (0,1l)", "description": "", "price": 6.90, "cost": 2.00},
                {"cat": "Wine", "name": "Lorenz & Dahlberg Premium Sekt (0,1l)", "description": "", "price": 7.90, "cost": 2.50},
                {"cat": "Wine", "name": "Terra 50 Riesling Bio Feinherb (0,2l)", "description": "Bottle: 27,90 €", "price": 8.50, "cost": 3.00},
                {"cat": "Wine", "name": "Weißburgunder Trocken (0,2l)", "description": "Bottle: 27,90 €", "price": 8.50, "cost": 3.00},
                {"cat": "Wine", "name": "Amphore Chardonnay Trocken (0,2l)", "description": "Bottle: 27,90 €", "price": 8.50, "cost": 3.00},
                {"cat": "Wine", "name": "Grüner Veltliner Trocken (0,2l)", "description": "Bottle: 27,90 €", "price": 8.50, "cost": 3.00},
                {"cat": "Wine", "name": "Muskateller Second Flight (0,2l)", "description": "Bottle: 27,90 €", "price": 8.50, "cost": 3.00},
                {"cat": "Wine", "name": "Valpolicella Ripasso Classico Superiore (0,2l)", "description": "Bottle: 49,90 €", "price": 13.50, "cost": 4.50},
                {"cat": "Wine", "name": "Black Print Markus Schneider (0,2l)", "description": "Bottle: 45,90 €", "price": 14.90, "cost": 5.00},
                {"cat": "Wine", "name": "Heredad Graula Airen Sauvignon Blanc Trocken (0,2l)", "description": "Flasche 27,90 €", "price": 8.50, "cost": 3.00},
                {"cat": "Wine", "name": "Rotweincuvée Qualitätswein Trocken (0,2l)", "description": "Flasche 27,90 €", "price": 8.90, "cost": 3.00},
                {"cat": "Wine", "name": "Merlot Bordeaux Prestige AOP (0,2l)", "description": "Flasche 29,90 €", "price": 9.90, "cost": 3.50},
                {"cat": "Wine", "name": "Altum Gewürztraminer Edelsüß (0,2l)", "description": "Flasche 31,90 €", "price": 9.90, "cost": 3.50},
                {"cat": "Wine", "name": "Quinta da Plansel Sweet Secrets Tinto Lieblich (0,2l)", "description": "Flasche 27,90 €", "price": 8.90, "cost": 3.00},
            
                # Digestif
                {"cat": "Digestif", "name": "Baileys 5,6 auf Eis (4cl)", "description": "", "price": 9.90, "cost": 3.00},
                {"cat": "Digestif", "name": "Havana Club (4cl)", "description": "", "price": 9.90, "cost": 3.00},
                {"cat": "Digestif", "name": "Jack Daniels (4cl)", "description": "", "price": 10.90, "cost": 3.50},
                {"cat": "Digestif", "name": "Tullamore Dew (4cl)", "description": "", "price": 10.90, "cost": 3.50},
                {"cat": "Digestif", "name": "Johnnie Walker Black Label (4cl)", "description": "", "price": 10.90, "cost": 3.50},
                {"cat": "Digestif", "name": "Dimple 15 Jahre (4cl)", "description": "", "price": 11.90, "cost": 4.00},
                {"cat": "Digestif", "name": "Sambuca mit Kaffeebohnen (4cl)", "description": "", "price": 6.10, "cost": 2.00},
                {"cat": "Digestif", "name": "Old Monk Rum", "description": "", "price": 7.50, "cost": 2.50},
                {"cat": "Digestif", "name": "Jägermeister", "description": "", "price": 5.10, "cost": 1.50},
                {"cat": "Digestif", "name": "Kümmerling", "description": "", "price": 5.10, "cost": 1.50},
                {"cat": "Digestif", "name": "Schierker Feuerstein", "description": "", "price": 5.10, "cost": 1.50},
                {"cat": "Digestif", "name": "Fernet Branca", "description": "", "price": 5.10, "cost": 1.50},
                {"cat": "Digestif", "name": "Ramazzotti", "description": "", "price": 5.90, "cost": 2.00},
                {"cat": "Digestif", "name": "Averna", "description": "", "price": 5.90, "cost": 2.00},
                {"cat": "Digestif", "name": "Malteser Kreuz", "description": "", "price": 5.90, "cost": 2.00},
                {"cat": "Digestif", "name": "Jubiläums Aquavit", "description": "", "price": 5.90, "cost": 2.00},
                {"cat": "Digestif", "name": "Slivovitz", "description": "", "price": 5.90, "cost": 2.00},
                {"cat": "Digestif", "name": "Williams Christbirne", "description": "", "price": 5.90, "cost": 2.00},
                {"cat": "Digestif", "name": "Wodka nach Angebot", "description": "", "price": 9.90, "cost": 3.00},
                {"cat": "Digestif", "name": "Grappa weiß", "description": "", "price": 9.90, "cost": 3.00},
                {"cat": "Digestif", "name": "Grappa gold", "description": "", "price": 10.90, "cost": 3.50},
                {"cat": "Digestif", "name": "Ouzo", "description": "", "price": 5.90, "cost": 2.00},
            
                # Beer
                {"cat": "Beer", "name": "König Pilsner vom Fass (0,4l)", "description": "0,25l 3,10 €", "price": 5.10, "cost": 1.50},
                {"cat": "Beer", "name": "Benedektiner Hefe vom Fass (0,5l)", "description": "0,3l 3,30 €", "price": 5.50, "cost": 1.80},
                {"cat": "Beer", "name": "Benedektiner Hell vom Fass (0,5l)", "description": "0,3l 3,30 €", "price": 5.50, "cost": 1.80},
                {"cat": "Beer", "name": "Köstritzer Schwarz vom Fass (0,5l)", "description": "0,3l 3,30 €", "price": 5.90, "cost": 2.00},
                {"cat": "Beer", "name": "Benedektiner Dunkel (0,5l)", "description": "", "price": 5.50, "cost": 1.80},
                {"cat": "Beer", "name": "Benedektiner Alkoholfrei (0,5l)", "description": "", "price": 4.90, "cost": 1.50},
                {"cat": "Beer", "name": "Alster mit Sprite (0,4l)", "description": "0,25l 3,30 €", "price": 5.10, "cost": 1.50},
                {"cat": "Beer", "name": "Diesel mit Cola (0,4l)", "description": "0,25l 3,30 €", "price": 5.50, "cost": 1.80},
                {"cat": "Beer", "name": "Bananenweizen (0,5l)", "description": "0,3l 3,30 €", "price": 5.90, "cost": 2.00},
                {"cat": "Beer", "name": "Bitburger Alkoholfrei (0,33l)", "description": "", "price": 4.50, "cost": 1.50},
                {"cat": "Beer", "name": "Fruchtbier Apfel / Kirsche / Holunder (0,4l)", "description": "Options: Rhabarber, Johannisbeere. Alcohol-free available.", "price": 4.50, "cost": 1.50},
            
                # Softdrinks
                {"cat": "Softdrinks", "name": "Fritz-Kola Original", "description": "", "price": 4.20, "cost": 1.50},
                {"cat": "Softdrinks", "name": "Fritz-Kola Super Zero", "description": "", "price": 4.20, "cost": 1.50},
                {"cat": "Softdrinks", "name": "Fritz-Mischmasch", "description": "", "price": 4.20, "cost": 1.50},
                {"cat": "Softdrinks", "name": "Fritz-Limo Orange/Zitrone/Apfel-Kirsch", "description": "Honigmelone/Ingwer-Limette", "price": 4.20, "cost": 1.50},
                {"cat": "Softdrinks", "name": "Fritz-Bio-Schorle Apfel/Rhabarber", "description": "", "price": 4.20, "cost": 1.50},
                {"cat": "Softdrinks", "name": "Kirsch Nektar/-schorle (0,4l)", "description": "0,2l 3,10 €", "price": 4.90, "cost": 1.50},
                {"cat": "Softdrinks", "name": "Mangosaft/-schorle (0,4l)", "description": "0,2l 3,10 €", "price": 5.10, "cost": 1.50},
                {"cat": "Softdrinks", "name": "Multivitaminsaft/-schorle (0,4l)", "description": "0,2l 3,10 €", "price": 5.50, "cost": 1.80},
                {"cat": "Softdrinks", "name": "Rhabarbersaft/-schorle (0,4l)", "description": "0,2l 3,10 €", "price": 5.50, "cost": 1.80},
                {"cat": "Softdrinks", "name": "Ananassaft (0,4l)", "description": "0,2l 3,10 €", "price": 5.50, "cost": 1.80},
                {"cat": "Softdrinks", "name": "KIBA (0,4l)", "description": "0,2l 3,50 €", "price": 5.50, "cost": 1.80},
                {"cat": "Softdrinks", "name": "Coca Cola / Light (0,4l)", "description": "0,2l 2,90 €", "price": 4.90, "cost": 1.50},
                {"cat": "Softdrinks", "name": "Fanta / Sprite / Spezi (0,4l)", "description": "0,2l 2,90 €", "price": 4.90, "cost": 1.50},
                {"cat": "Softdrinks", "name": "Fachinger Mineral Medium/Still (0,7l)", "description": "0,4l 4,50 € | 0,2l 2,90 €", "price": 9.90, "cost": 3.00},
                {"cat": "Softdrinks", "name": "Schweppes Ginger Ale/Tonic/Lemon (0,4l)", "description": "0,2l 3,10 €", "price": 4.90, "cost": 1.50},
                {"cat": "Softdrinks", "name": "Apfel/Orange/Johannisbeer-schorle (0,4l)", "description": "0,2l 3,10 €", "price": 4.90, "cost": 1.50},
            
                # Smoothies & Shakes
                {"cat": "Smoothies & Shakes", "name": "Golden Glow Smoothie", "description": "Mango, Ananas, Kurkuma, Kokoswasser, Limette", "price": 8.90, "cost": 3.00},
                {"cat": "Smoothies & Shakes", "name": "Green Stadtpark Smoothie", "description": "Spinat, Avocado, Apfel, Ingwer, Zitrone, Minze", "price": 8.90, "cost": 3.00},
                {"cat": "Smoothies & Shakes", "name": "Berry Splash Smoothie", "description": "Himbeere, Erdbeere, Chia, Rosenwasser, Kokosmilch", "price": 8.20, "cost": 2.80},
                {"cat": "Smoothies & Shakes", "name": "Bollywood Banana Shake", "description": "Banane, Honig, Mandelmilch, Sesam", "price": 8.90, "cost": 3.00},
                {"cat": "Smoothies & Shakes", "name": "Kulf Crush Shake", "description": "Hausgemachtes Mango-Kulfi-Eis, Safran, Milch, Pistazie", "price": 9.50, "cost": 3.50},
                {"cat": "Smoothies & Shakes", "name": "Strawberry Basil Shake", "description": "Frische Erdbeeren, Basilikum, Vanilleeis, Zitronenzeste", "price": 8.90, "cost": 3.00},
                {"cat": "Smoothies & Shakes", "name": "Mango Royale Lassi", "description": "Samtiger Mango-Lassi mit frischer Minze", "price": 7.90, "cost": 2.50},
                {"cat": "Smoothies & Shakes", "name": "Kesar Glow", "description": "Joghurt, Safran, Kardamom, Dattelsirup", "price": 8.90, "cost": 3.00},
                {"cat": "Smoothies & Shakes", "name": "Coconut Lassi", "description": "Kokosmilch, Joghurt, Vanille, Sesam", "price": 8.90, "cost": 3.00},
                {"cat": "Smoothies & Shakes", "name": "Cherry Blossom Lassi", "description": "Kirsche, Joghurt, Vanille, Rosenwasser", "price": 8.50, "cost": 2.80},
            
                # Cocktails
                {"cat": "Cocktails", "name": "Bollywood Negroni", "description": "Gin, Rosé Vermouth, Campari, Rosenwasser", "price": 13.50, "cost": 4.50},
                {"cat": "Cocktails", "name": "Margarita", "description": "Tequila, Triple Sec, Limettensaft", "price": 9.90, "cost": 3.00},
                {"cat": "Cocktails", "name": "Whiskey Passion", "description": "Whiskey, Zitronensaft, Eiweiß", "price": 10.50, "cost": 3.50},
                {"cat": "Cocktails", "name": "Mixi Refresher", "description": "Gurke, Basilikum, Limettensaft, Tonic Water, Vodka", "price": 8.50, "cost": 2.80},
                {"cat": "Cocktails", "name": "Blue Elbe", "description": "Gin, Zitrone, Coconut Cream, Ananas", "price": 10.90, "cost": 3.50},
                {"cat": "Cocktails", "name": "Mellen", "description": "Tequila, Limette, Vanille, Rosenwasser", "price": 10.50, "cost": 3.50},
                {"cat": "Cocktails", "name": "Mojito", "description": "Rum, Minze, Limette, Rohrzucker, Soda", "price": 9.90, "cost": 3.00},
                {"cat": "Cocktails", "name": "Bacardi Cola (4cl)", "description": "Longdrink", "price": 9.90, "cost": 3.00},
                {"cat": "Cocktails", "name": "Whiskey Cola (4cl)", "description": "Longdrink", "price": 9.90, "cost": 3.00},
                {"cat": "Cocktails", "name": "Wodka Orange/Cola/Lemon (4cl)", "description": "Longdrink", "price": 9.90, "cost": 3.00},
                {"cat": "Cocktails", "name": "Gin Tonic (4cl)", "description": "Longdrink", "price": 9.90, "cost": 3.00},
                {"cat": "Cocktails", "name": "Caipirinha", "description": "Longdrink", "price": 9.90, "cost": 3.00},
                {"cat": "Cocktails", "name": "Laly Lime Smash Mocktail", "description": "Frischer Limettensaft, Gurke, Koriander, Tonic", "price": 6.90, "cost": 2.00},
                {"cat": "Cocktails", "name": "Kiss from the Rose Mocktail", "description": "Rosenwasser, Erdbeer Crush, Limette, Apfel", "price": 7.20, "cost": 2.20},
                {"cat": "Cocktails", "name": "Evolution Mocktail", "description": "Passionsfrucht, Pfirsich, Ananas, Limette", "price": 7.50, "cost": 2.50},
                {"cat": "Cocktails", "name": "Spicy Mango Mocktail", "description": "Mango, Chili, Black Salt, Ginger Ale, Tonic", "price": 7.90, "cost": 2.50},
                {"cat": "Cocktails", "name": "Watermelon Masala Pop Mocktail", "description": "Wassermelone, Limette, Chaat Masala, Soda", "price": 7.20, "cost": 2.20},
                {"cat": "Cocktails", "name": "Peach Garden Mocktail", "description": "Pfirsich, Grüner Tee, Zitronenzeste, Honig", "price": 6.90, "cost": 2.00},
            
                # Drinks Fizz & Flavor
                {"cat": "Drinks", "name": "Classic Laly Lemon", "description": "Zitrone, Limette, Minze, Rohrzucker, Sprudel", "price": 5.50, "cost": 1.50},
                {"cat": "Drinks", "name": "Rosen-Litschi Limo", "description": "Litschi, Rosenwasser, Zitrone", "price": 5.90, "cost": 1.80},
                {"cat": "Drinks", "name": "Salty Lemon Pop", "description": "Zitrone, Meersalz, (Chili optional), Soda", "price": 5.50, "cost": 1.50},
                {"cat": "Drinks", "name": "Kiwi Cooler", "description": "Kiwi, Minze, Zitrone, Soda", "price": 5.90, "cost": 1.80},
                {"cat": "Drinks", "name": "Lavendel Lemonade", "description": "Lavendel, Blaubeere, Limette, Soda", "price": 6.20, "cost": 2.00},
                {"cat": "Drinks", "name": "Summer Cooler", "description": "Gurke, Basilikum, Zitrone, Soda", "price": 5.80, "cost": 1.80},
            
                # Global Glow
                {"cat": "Global Glow", "name": "Fresh Code", "description": "Feta, Kichererbsen, Gurke, Tomate, Joghurt, Oliven", "price": 15.90, "cost": 5.00},
                {"cat": "Global Glow", "name": "Green Energy", "description": "Avocado, Quinoa, Brokkoli, Edamame, Wasabi-Tahini (vegan)", "price": 17.90, "cost": 6.00},
                {"cat": "Global Glow", "name": "Tropical Crunch", "description": "Gegrillte Ananas, Curry-Kokos-Gemüse, Cashews", "price": 17.50, "cost": 5.50},
                {"cat": "Global Glow", "name": "Sunshine Seoul (Lachs)", "description": "Sushi-Reis, Kimchi, Mango, Chili-Mayo (mit Tofu 17,90 €)", "price": 20.90, "cost": 7.00},
                {"cat": "Global Glow", "name": "Middle Feast", "description": "Couscous, Falafel, Rote Bete, Granatapfel (vegan)", "price": 17.90, "cost": 6.00},
                {"cat": "Global Glow", "name": "Masala Move", "description": "Hähnchen, Mango, Basmatireis, Gurke, Paprika", "price": 18.90, "cost": 6.00},
            
                # The Warm-Up!
                {"cat": "The Warm-Up!", "name": "Red Velvet Tatar veggie", "description": "Rote Bete, Meerrettich, Haselnüsse", "price": 15.90, "cost": 5.00},
                {"cat": "The Warm-Up!", "name": "Sommersonne auf Brot veggie", "description": "Bruschetta, Burrata, Mango-Chutney", "price": 15.90, "cost": 5.00},
                {"cat": "The Warm-Up!", "name": "Pumpkin Bangkok - Thai Style", "description": "Hokkaido, Rotes Curry, Riesengarnelen", "price": 19.90, "cost": 7.00},
                {"cat": "The Warm-Up!", "name": "Sweet Heat (vegan)", "description": "Warme Tomaten-Erdbeer-Suppe, Minze, Pinienkerne", "price": 14.90, "cost": 4.50},
            
                # Es wird Ernst...
                {"cat": "Es wird Ernst...", "name": "Couscous Cauli Crush (vegan)", "description": "Blumenkohlsteak, Harissa, Granatapfel", "price": 19.50, "cost": 6.00},
                {"cat": "Es wird Ernst...", "name": "La Canette Sauvage", "description": "Rosa Entenbrust, Orangen-Blaubeer-Jus, Kartoffelpüree", "price": 29.90, "cost": 10.00},
                {"cat": "Es wird Ernst...", "name": "Small Bird. Big Flavor", "description": "Perlhuhn, Cranberry-Orange-Sauce, Sellerie-Püree", "price": 28.90, "cost": 9.50},
                {"cat": "Es wird Ernst...", "name": "The Crown Steak", "description": "150g A5 Kobe Wagyu, Blattgold, Yuzu-Trüffel", "price": 89.90, "cost": 40.00},
                {"cat": "Es wird Ernst...", "name": "Meat Me in the Tropics", "description": "Argentinisches Rinderfilet, Mango-Chili-Salsa", "price": 45.90, "cost": 15.00},
                {"cat": "Es wird Ernst...", "name": "Wiener Vibes", "description": "Kalbsschnitzel, Süßkartoffel-Pommes, Trüffel-Mayo", "price": 27.90, "cost": 9.00},
                {"cat": "Es wird Ernst...", "name": "Cream Catch", "description": "Pasta, Lachs, Champignons, Weißwein-Zitrone", "price": 25.90, "cost": 8.00},
                {"cat": "Es wird Ernst...", "name": "White Shore", "description": "Steinbeißer, Kapern-Dill-Sauce, Black & White Rice", "price": 27.90, "cost": 9.00},
                {"cat": "Es wird Ernst...", "name": "Zander con Fuego", "description": "Zanderfilet, Tamarinde-Mango-Chili", "price": 27.90, "cost": 9.00},
            
                # Singh Laly Signature Dishes
                {"cat": "Singh Laly Signature Dishes", "name": "Butter Chicken - next Laly Level", "description": "24h mariniert, Holzkohle gegrillt, Brot-Waffel", "price": 25.90, "cost": 8.50},
                {"cat": "Singh Laly Signature Dishes", "name": "Paneer Popcorn veggie", "description": "Crispy Paneer, Rote Bete-Zwiebel-Salat", "price": 17.90, "cost": 5.50},
                {"cat": "Singh Laly Signature Dishes", "name": "Polenta Fries - Italy meets India (vegan)", "description": "Polenta-Sticks, Masala-Tomaten-Ragù", "price": 11.90, "cost": 3.00},
            
                # Küche der 1000 Aromen
                {"cat": "Küche der 1000 Aromen", "name": "Kerala Greens Curry", "description": "Spinatsauce, Okraschoten, Babymais (vegan möglich)", "price": 17.50, "cost": 5.50},
                {"cat": "Küche der 1000 Aromen", "name": "Nordindisches Daal (vegan)", "description": "Gelbes Linsencurry, Kurkuma, Ingwer, Papadam", "price": 15.90, "cost": 4.50},
                {"cat": "Küche der 1000 Aromen", "name": "Royal Baingan (vegan)", "description": "Aubergine, schwarzer Knoblauch, Erdnuss-Tomaten-Crème", "price": 18.90, "cost": 6.00},
                {"cat": "Küche der 1000 Aromen", "name": "Kashmiri Slow Roast", "description": "Lamm, Aprikosen-Safran-Sauce, Nuss-Reis", "price": 28.90, "cost": 10.00},
                {"cat": "Küche der 1000 Aromen", "name": "Madras Tiger", "description": "Riesengarnelen in Tomaten-Kokos-Chili, flambiert mit Rum", "price": 25.90, "cost": 9.00},
                {"cat": "Küche der 1000 Aromen", "name": "Laly's Chicken Pops", "description": "Tandoori-Wings in Tamarinden-Glaze", "price": 14.90, "cost": 4.50},
            
                # End Game!
                {"cat": "End Game!", "name": "Chill Laly Bites", "description": "Mango-Kulfi-Würfel mit Chili-Crunch & Goldstaub (sugar free)", "price": 13.90, "cost": 4.00},
                {"cat": "End Game!", "name": "Golden Kaiser", "description": "Kaiserschmarrn mit Rosenwasser & Blattgold", "price": 17.90, "cost": 5.50},
                {"cat": "End Game!", "name": "Glow & Spice", "description": "Safran-Panna-Cotta auf Erdbeer-Chili-Spiegel", "price": 12.50, "cost": 3.50},
                {"cat": "End Game!", "name": "Rasmalai Tiramisu", "description": "Rasmalai auf Kardamom-Biskuit mit Chai-Zimt-Sirup", "price": 12.90, "cost": 4.00},
                {"cat": "End Game!", "name": "Mango-Chia Kheer", "description": "Chia-Pudding mit Mandelmilch & Alphonso-Mango (vegan)", "price": 7.90, "cost": 2.00},
            
                # Kuchenglück & Kugelliebe
                {"cat": "Kuchenglück & Kugelliebe", "name": "Streuselkuchen", "description": "", "price": 4.90, "cost": 1.50},
                {"cat": "Kuchenglück & Kugelliebe", "name": "Verschiedene Torten", "description": "Ab 6,90 €", "price": 6.90, "cost": 2.00},
                {"cat": "Kuchenglück & Kugelliebe", "name": "Kaffee & Kuchen ELB Spezial", "description": "Streuselkuchen & Filterkaffee", "price": 7.90, "cost": 2.50},
                {"cat": "Kuchenglück & Kugelliebe", "name": "Ice, Ice Baby Schoko-Becher", "description": "Other variants: Eierlikör, Erdbeer, Früchte, Schweden", "price": 7.90, "cost": 2.50},
            
                # Hot Drinks
                {"cat": "Hot Drinks", "name": "Espresso", "description": "", "price": 3.10, "cost": 0.50},
                {"cat": "Hot Drinks", "name": "Espresso Macchiato", "description": "", "price": 4.90, "cost": 1.00},
                {"cat": "Hot Drinks", "name": "Café au lait", "description": "", "price": 3.90, "cost": 0.80},
                {"cat": "Hot Drinks", "name": "Cappuccino", "description": "", "price": 5.90, "cost": 1.50},
                {"cat": "Hot Drinks", "name": "Latte Macchiato", "description": "", "price": 4.10, "cost": 1.00},
                {"cat": "Hot Drinks", "name": "Kaffee Crème", "description": "", "price": 3.90, "cost": 0.80},
                {"cat": "Hot Drinks", "name": "Kännchen Kaffee", "description": "", "price": 6.20, "cost": 1.50},
                {"cat": "Hot Drinks", "name": "Heiße Schokolade", "description": "", "price": 4.50, "cost": 1.00},
                {"cat": "Hot Drinks", "name": "Schokochino Spezial", "description": "", "price": 4.90, "cost": 1.00},
                {"cat": "Hot Drinks", "name": "Tee nach Angebot", "description": "", "price": 3.50, "cost": 0.50},
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
            # 3d. MENU MODIFIERS
            # ---------------------------------------------------------
            modifiers_spec = []
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
            combos_spec = []
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
            from app.reservations.models import Table
            from sqlalchemy import delete
            
            # PURGE STALE SEATING DATA TO PREVENT ALIGNMENT MESS
            await db.execute(delete(Table).where(Table.restaurant_id == rid))
            await db.execute(delete(FloorSection).where(FloorSection.restaurant_id == rid))
            await db.flush()
            log("  [SEATING] Purged stale sections and tables for clean seed")

            sections_data = [
                {"name": "Restaurant", "description": "175 seats indoor dining", "sort_order": 1},
                {"name": "Terrasse", "description": "174 seats outdoor area", "sort_order": 2},
                {"name": "Tagung", "description": "60 seats main area", "sort_order": 3},
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

            # Detailed layout for Restaurant section based on user image
            table_list_restaurant = [
                # Table number, capacity, x, y, rotation, width, height, shape
                # ── Top Arch (Row 1) ──
                ("16", 2, 40, 180, -40, 80, 80, "square"),
                ("16/1", 4, 130, 120, 0, 80, 80, "square"),
                ("25 ...", 4, 250, 70, -25, 80, 80, "square"),
                ("24/3", 4, 380, 60, 0, 80, 80, "square"),
                ("23/3", 4, 480, 60, 0, 80, 80, "square"),
                ("22/4", 4, 600, 60, 0, 80, 80, "square"),
                ("21/4", 4, 720, 40, 0, 80, 80, "square"),

                # ── Second Arch / Diagonal ──
                ("15", 2, 110, 240, -40, 80, 80, "square"),
                ("2...", 4, 210, 170, -25, 80, 80, "square"),
                ("24 ...", 4, 350, 120, -25, 80, 80, "square"),
                ("23 ...", 8, 430, 170, -30, 100, 160, "rectangle"),
                ("22/3", 4, 600, 160, 0, 80, 80, "square"),
                ("21/3", 4, 720, 120, 0, 80, 80, "square"),

                # ── Third Arc / Middle ──
                ("14", 2, 180, 310, -35, 80, 80, "square"),
                ("24/1", 2, 300, 240, -15, 80, 80, "square"),
                ("22 ...", 7, 540, 260, -35, 100, 160, "rectangle"),
                ("21/2", 4, 720, 220, 0, 80, 80, "square"),

                # ── Fourth Arch ──
                ("13", 2, 260, 360, -35, 80, 80, "square"),
                ("23/1", 2, 380, 330, 0, 80, 80, "square"),
                ("10", 4, 480, 460, 0, 80, 80, "square"),
                ("21 ...", 5, 620, 330, -35, 100, 160, "rectangle"),
                ("21/1", 2, 600, 440, 0, 80, 80, "square"),

                # ── Fifth Arch ──
                ("12", 2, 340, 420, -35, 80, 80, "square"),
                ("2...", 2, 440, 410, 0, 80, 80, "square"),
                ("22/1", 2, 530, 410, 0, 80, 80, "square"),

                # ── Bottom Arch ──
                ("11", 2, 420, 490, -35, 80, 80, "square"),

                # ── Central Vertical (Circles & Squares) ──
                ("1/1", 4, 400, 560, 0, 80, 80, "square"),
                ("1", 1, 500, 560, 0, 80, 80, "round"),
                ("31/1", 2, 650, 590, 0, 80, 60, "rectangle"),
                ("32/1", 4, 800, 450, 0, 80, 80, "square"),

                ("2/1", 4, 400, 660, 0, 80, 80, "square"),
                ("2", 1, 500, 660, 0, 80, 80, "round"),
                ("33/1", 2, 600, 680, 0, 80, 60, "rectangle"),
                ("32", 4, 720, 520, 0, 80, 80, "square"),
                ("31", 4, 800, 580, 0, 80, 80, "square"),

                ("3/1", 4, 400, 760, 0, 80, 80, "square"),
                ("3", 1, 500, 760, 0, 80, 80, "round"),
                ("39", 4, 600, 760, 0, 80, 80, "square"),
                ("33", 4, 720, 640, 0, 80, 80, "square"),
                ("33/2", 4, 800, 680, 0, 80, 80, "square"),

                ("4/1", 4, 400, 860, 0, 80, 80, "square"),
                ("4", 1, 500, 860, 0, 80, 80, "round"),
                ("38", 4, 600, 860, 0, 80, 100, "rectangle"),
                ("34", 4, 720, 760, 0, 80, 80, "square"),
                ("34/2", 4, 800, 780, 0, 80, 80, "square"),

                ("5/1", 4, 400, 960, 0, 80, 80, "square"),
                ("5", 1, 500, 960, 0, 80, 80, "round"),
                ("37", 4, 600, 960, 0, 80, 100, "rectangle"),
                ("35", 4, 720, 860, 0, 80, 80, "square"),
                ("35/2", 4, 800, 880, 0, 80, 80, "square"),

                ("36", 4, 720, 970, 0, 80, 80, "square"),
                ("36/2", 4, 800, 970, 0, 80, 80, "square"),

                # Tagung Zone (Box)
                ("#1000 TAGUNG / MEETIN...", 0, 100, 580, 0, 230, 320, "rectangle")
            ]

            table_list_terrasse = [
                ("76", 4), ("75", 4), ("74", 3), ("73", 2), ("72", 2), ("71", 3), ("70", 6),
                ("83", 4), ("68", 6), ("58", 4), ("57", 4), ("56", 4), ("55", 4), ("54", 4), ("53", 4),
                ("Lounge 1", 4), ("Lounge 2", 4), ("Lounge 3", 4),
                ("6", 2), ("6/1", 2), ("64", 2), ("63", 3), ("62", 8), ("61", 8), ("60", 2), ("80", 4),
                ("Lounge 4", 8), ("81", 4), ("82", 4),
                ("47", 5), ("46", 2), ("45", 4), ("44", 4), ("43", 6), ("42", 4), ("41", 8), ("40", 6),
                ("52", 4), ("51", 6), ("51/1", 4), ("49", 4)
            ]

            table_list_tagung = [
                ("100", 4), ("103", 4), ("106", 4), ("109", 4), ("112", 4),
                ("101", 4), ("104", 4), ("107", 4), ("110", 4), ("113", 4),
                ("102", 4), ("105", 4), ("108", 4), ("111", 4), ("114", 4)
            ]

            tables_data = []
            
            # Map structural arrays into standardized database dictionaries
            for t_info in table_list_restaurant:
                tnum, cap, x, y, rot, w, h, shp = t_info
                tables_data.append({
                    "section_id": sec_map.get("Restaurant"), 
                    "table_number": str(tnum).strip(), 
                    "capacity": cap, 
                    "min_capacity": max(1, cap//2) if cap > 0 else 0, 
                    "shape": shp, 
                    "position_x": int(x), 
                    "position_y": int(y),
                    "rotation": float(rot),
                    "width": float(w),
                    "height": float(h)
                })
                
            for idx, (tnum, cap) in enumerate(table_list_terrasse):
                tables_data.append({
                    "section_id": sec_map.get("Terrasse"), 
                    "table_number": str(tnum).strip(), 
                    "capacity": cap, 
                    "min_capacity": max(1, cap//2), 
                    "shape": "square", 
                    "position_x": (idx % 8) * 100 + 50, 
                    "position_y": (idx // 8) * 100 + 50,
                    "rotation": 0.0,
                    "width": 80.0,
                    "height": 80.0
                })
                
            for idx, (tnum, cap) in enumerate(table_list_tagung):
                tables_data.append({
                    "section_id": sec_map.get("Tagung"), 
                    "table_number": str(tnum).strip(), 
                    "capacity": cap, 
                    "min_capacity": max(1, cap//2), 
                    "shape": "square", 
                    "position_x": (idx % 5) * 150 + 100, 
                    "position_y": (idx // 5) * 150 + 100,
                    "rotation": 0.0,
                    "width": 120.0,
                    "height": 80.0
                })

            table_count = 0
            for t in tables_data:
                if not t.get("section_id"):
                    continue
                res = await db.execute(
                    select(Table).where(
                        Table.restaurant_id == rid,
                        Table.table_number == t["table_number"],
                        Table.section_id == t["section_id"]
                    )
                )
                existing = res.scalar_one_or_none()
                if not existing:
                    new_table = Table(restaurant_id=rid, **t)
                    db.add(new_table)
                    table_count += 1
                else:
                    # Update existing table positions/metadata in case they changed
                    existing.position_x = t["position_x"]
                    existing.position_y = t["position_y"]
                    existing.rotation = t["rotation"]
                    existing.width = t["width"]
                    existing.height = t["height"]
                    existing.shape = t["shape"]
                    existing.capacity = t["capacity"]
                    table_count += 1

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

            # ---------------------------------------------------------
            # 3k. HMS (Hotel Management System)
            # ---------------------------------------------------------
            res = await db.execute(select(HotelProperty).limit(1))
            property = res.scalar_one_or_none()
            if not property:
                log("  [HMS] No property found — creating 'Das Elb Hotel'...")
                property = HotelProperty(
                    name="Das Elb Hotel",
                    address="Elbufer 12",
                    city="Hamburg",
                    country="Germany",
                    timezone="Europe/Berlin",
                    currency="EUR",
                    settings_json={"allow_pets": True, "checkout_time": "11:00"},
                )
                db.add(property)
                await db.flush()
                await db.refresh(property)
            
            res = await db.execute(select(RoomType).where(RoomType.property_id == property.id))
            room_types = list(res.scalars().all())
            if not room_types:
                log("  [HMS] Seeding room types...")
                types_spec = [
                    {"name": "Standard Single", "base_occupancy": 1, "max_occupancy": 1, "base_price": 89.0},
                    {"name": "Standard Double", "base_occupancy": 2, "max_occupancy": 2, "base_price": 129.0},
                    {"name": "Deluxe River View", "base_occupancy": 2, "max_occupancy": 3, "base_price": 189.0},
                    {"name": "The Elb Suite", "base_occupancy": 2, "max_occupancy": 4, "base_price": 349.0},
                ]
                for ts in types_spec:
                    rt = RoomType(property_id=property.id, **ts)
                    db.add(rt)
                    room_types.append(rt)
                await db.flush()
            
            res = await db.execute(select(Room).where(Room.property_id == property.id))
            if not res.scalars().all():
                log("  [HMS] Seeding rooms...")
                # Add 5 rooms per type
                for idx, rt in enumerate(room_types):
                    for rnum in range(1, 6):
                        room_number = f"{idx+1}0{rnum}"
                        room = Room(
                            property_id=property.id,
                            room_number=room_number,
                            room_type_id=rt.id,
                            floor=idx+1,
                            status="available"
                        )
                        db.add(room)
                await db.flush()
                log("  [HMS] 20 rooms seeded.")

        await db.commit()
        log("Master Migration Complete!")

    await engine.dispose()
    return logs


if __name__ == "__main__":
    asyncio.run(migrate_master())
