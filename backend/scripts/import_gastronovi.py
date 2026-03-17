#!/usr/bin/env python3
"""
Import gastronovi data into Gestronomy database.
Run: PYTHONPATH=/Users/ali/Desktop/gestronomy/backend python scripts/import_gastronovi.py
"""
import asyncio
import sys
from datetime import date, time, timedelta
from decimal import Decimal
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text
from app.database import async_session
from app.menu.models import MenuCategory, MenuItem
from app.guests.models import GuestProfile  # needed for FK resolution
from app.reservations.models import FloorSection, Table, Reservation

# ── Menu Categories (from gastronovi tree) ──
CATEGORIES = [
    # Getränke (Drinks)
    {"name": "Alkoholfreie Getränke", "description": "Softdrinks, Säfte, Wasser", "icon": "🥤", "color": "#3b82f6", "sort_order": 1},
    {"name": "Heißgetränke", "description": "Kaffee, Tee, Kakao", "icon": "☕", "color": "#92400e", "sort_order": 2},
    {"name": "Aperitifs & Sekt", "description": "Aperitifs, Sekt, Prosecco", "icon": "🥂", "color": "#f59e0b", "sort_order": 3},
    {"name": "Bier", "description": "Vom Fass und aus der Flasche", "icon": "🍺", "color": "#d97706", "sort_order": 4},
    {"name": "Cocktails & Longdrinks", "description": "Klassiker und Eigenkreationen", "icon": "🍸", "color": "#ec4899", "sort_order": 5},
    {"name": "Spirituosen", "description": "Whisky, Rum, Gin und mehr", "icon": "🥃", "color": "#7c3aed", "sort_order": 6},
    {"name": "Wein", "description": "Rot-, Weiß- und Roséwein", "icon": "🍷", "color": "#dc2626", "sort_order": 7},
    {"name": "Champagner", "description": "Moët & Chandon und mehr", "icon": "🍾", "color": "#eab308", "sort_order": 8},
    # Speisen (Food)
    {"name": "Vorspeisen & Suppen & Salate", "description": "Starters, soups and salads", "icon": "🥗", "color": "#22c55e", "sort_order": 9},
    {"name": "Hauptspeisen", "description": "Main courses", "icon": "🍽️", "color": "#ef4444", "sort_order": 10},
    {"name": "Indische Karte", "description": "Indian specialities", "icon": "🍛", "color": "#f97316", "sort_order": 11},
    {"name": "Dessert", "description": "Nachspeisen und Eis", "icon": "🍰", "color": "#a855f7", "sort_order": 12},
    {"name": "Bowls", "description": "Fresh bowls", "icon": "🥣", "color": "#14b8a6", "sort_order": 13},
    {"name": "Buffets", "description": "Buffet-Angebote", "icon": "🍱", "color": "#6366f1", "sort_order": 14},
    {"name": "Kindergerichte", "description": "Für unsere kleinen Gäste", "icon": "👶", "color": "#f472b6", "sort_order": 15},
    {"name": "Spargelkarte", "description": "Saisonale Spargelgerichte", "icon": "🌿", "color": "#84cc16", "sort_order": 16},
    {"name": "Frühstück", "description": "Breakfast items", "icon": "🥐", "color": "#fbbf24", "sort_order": 17},
    {"name": "Dubai Schokolade", "description": "Dubai chocolate specialities", "icon": "🍫", "color": "#78350f", "sort_order": 18},
]

# ── Menu Items mapped to categories ──
# Items extracted from gastronovi grouped by category based on the menu tree structure
ITEMS_BY_CATEGORY = {
    "Alkoholfreie Getränke": [
        ("Fachinger Mineral medium (0,2l)", 2.90), ("Fachinger Mineral medium (0,4l)", 4.50),
        ("Fachinger Mineral medium (0,7l)", 9.90), ("Fachinger Mineral still (0,2l)", 2.90),
        ("Fachinger Mineral still (0,4l)", 4.50), ("Fachinger Mineral still (0,7l)", 9.90),
        ("Coca Cola (0,2l)", 2.90), ("Coca Cola (0,4l)", 4.90),
        ("Coca Cola light (0,2l)", 2.90), ("Coca Cola light (0,4l)", 4.90),
        ("Fanta (0,2l)", 2.90), ("Fanta (0,4l)", 4.90),
        ("Sprite (0,2l)", 2.90), ("Sprite (0,4l)", 4.90),
        ("Spezi (0,2l)", 2.90), ("Spezi (0,4l)", 4.90),
        ("Apfelsaft (0,2l)", 6.10), ("Apfelsaft (0,4l)", 7.90),
        ("Orangensaft (0,2l)", 6.10), ("Orangensaft (0,4l)", 7.90),
        ("Ananassaft (0,2l)", 3.10), ("Ananassaft (0,4l)", 7.90),
        ("Mangosaft (0,2l)", 6.10), ("Mangosaft (0,4l)", 7.90),
        ("Rhabarba Saft (0,2l)", 6.10), ("Rhabarba Saft (0,4l)", 7.90),
        ("Johannisbeernektar (0,2l)", 6.10), ("Johannisbeernektar (0,4l)", 7.90),
        ("Kirschnektar (0,2l)", 6.10), ("Kirschnektar (0,4l)", 7.90),
        ("Guavensaft (0,2l)", 6.10), ("Guavensaft (0,4l)", 7.90),
        ("Bananensaft (0,4l)", 7.90), ("Multivitaminsaft (0,2l)", 6.10),
        ("Multivitaminsaft (0,4l)", 7.90), ("KIBA (0,2l)", 6.10), ("KIBA (0,4l)", 7.90),
        ("Apfelschorle (0,2l)", 6.10), ("Apfelschorle (0,4l)", 7.90),
        ("Orangenschorle (0,2l)", 6.10), ("Orangenschorle (0,4l)", 7.90),
        ("Rhabarba Schorle (0,2l)", 6.10), ("Rhabarba Schorle (0,4l)", 7.90),
        ("Johannisschorle (0,2l)", 6.10), ("Johannisschorle (0,4l)", 7.90),
        ("Mangoschorle (0,2l)", 6.10), ("Mangoschorle (0,4l)", 7.90),
        ("Guavensaftschorle (0,2l)", 6.10), ("Guavensaftschorle (0,4l)", 7.90),
        ("Kirschschorle (0,2l)", 6.10), ("Kirschschorle (0,4l)", 7.90),
        ("Bitter Lemon (0,2l)", 6.10), ("Bitter Lemon (0,4l)", 7.90),
        ("Ginger Ale (0,2l)", 6.10), ("Ginger Ale (0,4l)", 7.90),
        ("Tonic Water (0,2l)", 6.10), ("Tonic Water (0,4l)", 7.90),
        ("Bitburger alkoholfrei (0,33l)", 7.50), ("Vita Malz (0,33l)", 7.90),
        ("fritz-kola (0,33l)", 4.20), ("fritz-kola super zero (0,33l)", 4.20),
        ("fritz-limo apfel-kirsch-holunder (0,33l)", 4.20),
        ("fritz-limo honigmelone (0,33l)", 4.20), ("fritz-limo ingwer-limette (0,33l)", 4.20),
        ("fritz-limo orange (0,33l)", 4.20), ("fritz-limo zitrone (0,33l)", 4.20),
        ("fritz-Mischmasch", 4.20), ("fritz-spritz bio apfelschorle (0,33l)", 4.20),
        ("fritz-spritz bio rhabarberschorle (0,33l)", 4.20),
        ("Crodino Spritz alkoholfrei", 7.90),
    ],
    "Heißgetränke": [
        ("Kaffee Créme", 3.90), ("Kännchen Kaffee", 6.20), ("Kaffee koffeinfrei", 3.50),
        ("Cappuccino", 3.90), ("Latte Macchiato", 4.10), ("Espresso (einfach)", 3.10),
        ("Espresso (doppelt)", 4.90), ("Espresso Macchiato", 4.90),
        ("Café au lait", 3.90), ("Choco Chino", 4.90),
        ("Heiße Schokolade (dunkel)", 4.50), ("Matcha Latte", 4.99),
        ("Irish Coffee", 7.90), ("Tee", 3.50),
    ],
    "Aperitifs & Sekt": [
        ("Aperol Spritz", 8.90), ("Aperol Spritz (0,2l)", 13.90),
        ("Hugo 'Elb'", 8.90), ("Hugo 'Elb' (Sommer)", 9.90),
        ("Hugo 'Elb' alkoholfrei", 8.90), ("Lillet", 8.90),
        ("Sarti Lemon Spritz", 9.90), ("Sarti Spritz", 9.90),
        ("Campari Spritz", 9.90), ("Prosecco trocken (0,1l)", 13.90),
        ("Sekt (0,1l)", 4.90), ("Martini bianco (5cl)", 7.90),
        ("Martini Dry (5cl)", 7.90), ("Martini Rosso (5cl)", 7.90),
        ("Sherry dry (5cl)", 4.90), ("Sherry medium (5cl)", 4.90),
        ("Lorenz & Dahlberg Premium Sekt Brut (0,1l)", 9.90),
        ("Costaross Prosecco DOC frizzante (0,1l)", 6.90),
        ("Costaross Prosecco DOC frizzante (0,7l)", 45.90),
    ],
    "Bier": [
        ("König Pilsener (0,25l)", 6.10), ("König Pilsener (0,4l)", 8.10),
        ("Benediktiner Hell (0,3l)", 6.30), ("Benediktiner Hell (0,5l)", 8.50),
        ("Benediktiner Hefe (0,3l)", 6.30), ("Benediktiner Hefe (0,5l)", 8.50),
        ("Benediktiner dunkel (0,5l)", 7.90), ("Benediktiner alkoholfrei (0,5l)", 7.90),
        ("Köstritzer Schwarz (0,3l)", 6.30), ("Köstritzer Schwarz (0,5l)", 8.90),
        ("Alster (0,25l)", 6.30), ("Alster (0,4l)", 8.10),
        ("Diesel (0,25l)", 6.30), ("Diesel (0,4l)", 8.50),
        ("Bananenweizen (0,3l)", 6.30), ("Bananenweizen (0,5l)", 8.90),
        ("Fruchtbier (0,4l)", 8.90), ("Fruchtbier alkoholfrei (0,4l)", 8.90),
        ("alkoholfrei Radler (0,4l)", 6.50),
    ],
    "Cocktails & Longdrinks": [
        ("Caipirinha", 9.90), ("Caipirinha (0,3l)", 12.90),
        ("Mojito", 9.90), ("Cuba Libre", 9.90), ("Margarita", 9.90),
        ("alkoholfreie Caipirinha", 9.90), ("Gin Tonic", 9.90),
        ("Gin Tonic (0,3l)", 14.90), ("Whiskey Cola", 9.90),
        ("Wodka Cola", 9.90), ("Wodka Lemon", 9.90), ("Wodka Orange", 9.90),
        ("Bacardi Cola", 9.90), ("Bacardi Cola (0,3l)", 12.90),
        ("Havanna Cola (0,3l)", 12.90), ("Campari Orange", 8.90),
        ("Campari Soda", 8.90), ("Campari Mango", 8.90),
        ("Blue Elbe", 10.90), ("Grüne Wiese", 9.90), ("Whiskey passion", 10.50),
        ("Bollywood Negroni", 13.50), ("Mellen", 10.50),
    ],
    "Spirituosen": [
        ("Amaretto (4cl)", 8.50), ("Baileys (4cl)", 9.90),
        ("Bacardi White (4cl)", 9.90), ("Bombay Sapphire Gin (4cl)", 9.90),
        ("Chivas Regal (4cl)", 12.90), ("Dimple (4cl)", 11.90),
        ("Grappa gold (4cl)", 10.90), ("Grappa weiß (4cl)", 9.90),
        ("Havana Club (4cl)", 9.90), ("Hennessy Very Special Cognac (4cl)", 13.90),
        ("Hennessy Cognac X.O (4cl)", 15.00), ("Jack Daniels (4cl)", 10.90),
        ("Jägermeister (4cl)", 8.10), ("Johnnie Walker (4cl)", 7.90),
        ("Ballantines (4cl)", 10.90), ("Glenmorangie Single Malt (4cl)", 12.90),
        ("Glenmorangie The Nectar d'or Highland (4cl)", 18.90),
        ("Metaxa 5 Sterne (4cl)", 10.90), ("Old Monk Rum (4cl)", 7.50),
        ("Ouzo (4cl)", 5.90), ("Ramazotti (4cl)", 8.90),
        ("Rémy Martin (4cl)", 13.90), ("Sambuca (4cl)", 6.10),
        ("Schierker Feuerstein (4cl)", 5.10), ("Tullamore Dew (4cl)", 10.90),
        ("Wodka (5cl)", 9.90), ("Williams Christ Birne (4cl)", 8.90),
        ("Ardbeg Scotch Whiskey (4cl)", 15.00), ("Fernet Branca (4cl)", 6.50),
        ("Averna (4cl)", 6.50), ("Schwarzwälder Kirschwasser (4cl)", 5.90),
        ("Slivovitz (4cl)", 5.90), ("Underberg (4cl)", 5.10),
        ("Kümmerling (4cl)", 5.10), ("Malteser Kreuz (4cl)", 5.90),
        ("Jubiläums Aquavit (4cl)", 5.90),
    ],
    "Wein": [
        ("Altum Gewürztraminer 0,2l", 9.90), ("Altum Gewürztraminer 0,75l", 31.90),
        ("Amphore Chardonnay 0,2l", 8.50), ("Amphore Chardonnay 0,75l", 27.90),
        ("Black Print Trocken 0,2l", 14.90), ("Black Print Trocken 0,75l", 45.90),
        ("Elbkilometer 454 Cuveé 0,2l", 8.50), ("Elbkilometer 454 Cuveé 0,75l", 27.90),
        ("Grüner Veltiner Trocken 0,2l", 8.50), ("Grüner Veltiner Trocken 0,75l", 27.90),
        ("Muskateller Second Flight Trocken 0,2l", 8.50), ("Muskateller Second Flight Trocken 0,75l", 27.90),
        ("Onkel Doktor Scheurebe & Riesling Halbtrocken 0,2l", 8.50),
        ("Onkel Doktor Scheurebe & Riesling Halbtrocken 0,75l", 27.90),
        ("Sauvignon Blanc Trocken 0,2l", 8.50), ("Sauvignon Blanc Trocken 0,75l", 27.90),
        ("Terra 50 Riesling Qualitätswein 0,2l", 8.90), ("Terra 50 Riesling Qualitätswein 0,75l", 27.90),
        ("Weißburgunder Trocken 0,2l", 8.50), ("Weißburgunder Trocken 0,75l", 27.90),
        ("Rotweincuveé Trocken 0,2l", 8.90), ("Rotweincuveé Trocken 0,75l", 27.90),
        ("Merlot Bordeaux Trocken 0,2l", 9.90), ("Merlot Bordeaux Trocken 0,75l", 29.90),
        ("Quinta Da Plansel 0,2l", 8.90), ("Quinta Da Plansel 0,75l", 27.90),
        ("Cruse Merlot Vin de Pays d'Oc IGP (0,2l)", 9.90),
        ("Cruse Merlot Vin de Pays d'Oc IGP (0,75l)", 39.90),
        ("Hofgut Gönnheim Cabernet & Merlot QbA (0,2l)", 13.90),
        ("Hofgut Gönnheim Cabernet & Merlot QbA (0,75l)", 39.90),
        ("Hofgut Gönnheim Rosé QbA (0,2l)", 13.90), ("Hofgut Gönnheim Rosé QbA (0,75l)", 39.90),
        ("Hofgut Grauburgunder QbA (0,2l)", 13.90), ("Hofgut Grauburgunder QbA (0,75l)", 39.90),
        ("Château Pigoudet Cuvée Premiere Rosé AOC (0,2l)", 13.90),
        ("Chateau Pigoudet Cuvée Rosé (0,75l)", 39.90),
        ("Sauvignon Vin de Pays d'Oc (0,2l)", 13.90), ("Sauvignon Vin de Pays d'Oc (0,75l)", 39.90),
        ("Minuty Cuveé Rosé Trocken 0,2l", 14.90), ("Minuty Cuveé Rosé Trocken 0,75l", 45.90),
        ("Spätburgunder Rosé (0,2l)", 13.90), ("Spätburgunder Rosé (0,75l)", 39.90),
        ("Gran Appasso Collezzione IGP (0,75l)", 71.90),
        ("Bodegas Santalba Rioja Crianza (0,75l)", 61.90),
        ("Valpolicella Ripasso Classico trocken 0,2l", 13.50),
        ("Valpolicella Ripasso Classico trocken 0,75l", 49.90),
        ("Héritage de Rothschild Sauvignon Blanc (0,75l)", 75.90),
        ("Molitor Kabinett Balck Edition (0,75l)", 69.90),
        ("Weiße Trauben QbA (0,2l)", 10.90), ("Weiße Trauben QbA (0,75l)", 39.90),
        ("Julius Knöll Rote Trauben QbA (0,2l)", 13.90), ("Julius Knöll Rote Trauben QbA (0,75l)", 39.90),
        ("Hauswein Rot", 11.90), ("Hauswein Weiß", 11.90), ("Weinschorle", 6.90),
        ("Roséwein 0,2l", 8.50), ("große Weinflasche (1l)", 59.90),
        ("Estancia Mendoza - Roble - Malbec (0,2l)", 8.90),
    ],
    "Champagner": [
        ("Moët & Chandon Impéral (0,75l)", 99.00),
        ("Moët & Chandon Rosé Impéral (0,75l)", 129.00),
        ("Moët & Chandon Ice Impéral Rosé (0,75l)", 129.00),
        ("Dom Pérignon Vintage 2010 (0,75l)", 250.00),
    ],
    "Vorspeisen & Suppen & Salate": [
        ("Bruschetta", 12.90), ("knuspringe Bruschetta", 14.90),
        ("Knoblauchbrot", 9.90), ("gefüllte Champignons", 9.90),
        ("Rote Bete Capaccio", 13.90), ("Rinder Tatar", 18.90),
        ("Rindertartar", 19.90), ("Tatar vom geräucherten Lachs", 16.50),
        ("rote Forellenkaviar", 19.90), ("frische Sommertrüffel", 19.90),
        ("cremige Kartoffelrahmsuppe", 14.90), ("Pilzsuppe nach Art des Hauses", 13.90),
        ("klare Hähnchenbrühe", 9.90), ("Waldpilzsuppe", 9.90),
        ("samtige Kürbiscremesuppe", 15.90), ("Weiße Crémesuppe", 7.90),
        ("Tomaten-Creme-Suppe", 9.90), ("Rinderbouillon", 13.90),
        ("Tom Kha Gai Suppe", 12.90), ("Tom Yam Suppe", 11.90),
        ("Kartoffel Joghurt Suppe", 13.90),
        ("Caesar Salat", 14.90), ("Rucola Salat", 14.90),
        ("Hähnchensalat", 15.90), ("Hähnchensalat mit Trüffel", 35.80),
        ("Nicoise Salat", 25.90), ("Belugalinsen Salat", 19.90),
        ("Riesengarnelen Salat", 22.90), ("Burrata Salat", 17.90),
        ("gerösteter Chicoree-Salat", 14.90), ("Sommer Salat", 13.90),
    ],
    "Hauptspeisen": [
        ("* auf der Haut gebratenes Zanderfilet", 7.50),
        ("* kleines Medaillon vom argentinischen Rinderfilet (150 gr.)", 9.90),
        ("*goldgelbes Kalbsschnitzel", 6.00),
        ("200 gr. Rumpsteak", 12.90), ("argentinisches Rinderfilet", 35.90),
        ("Rumpsteak", 35.90), ("gegrilltes Rinderfilet", 45.00),
        ("Rinderfilet Spezial", 39.90), ("Steak Hawaii", 14.90),
        ("Wiener Schnitzel", 24.90), ("Kalbsschnitzel", 14.90),
        ("Kalbsleber", 14.90), ("gegrillte Rinderleber", 12.90),
        ("Leber Spezial", 14.90), ("Rinderroulade", 14.90),
        ("norwegisches Lachsfilet", 27.90), ("goldbraum knusprig gebratenes Lachsfilet", 29.20),
        ("knusprig gebratenes Zanderfilet", 29.90), ("Zanderfilet", 35.90),
        ("Forelle Müllerin Art", 22.90), ("Steinbeißerfilet", 29.90),
        ("Thunfischsteak", 29.90), ("Fish Piccata", 25.90),
        ("Dorade - Sizilianische Art", 24.90), ("Backfisch 'Das ELB'", 21.90),
        ("Fischplatte für 2 Personen", 74.90),
        ("Garnelen", 17.90), ("Riesengarnelen", 23.90),
        ("Scampi aglio e olio", 20.90), ("Bandnudeln mit Jakobsmuscheln", 35.90),
        ("Chicken Piccata", 19.90), ("Chicken Spinaci", 19.90),
        ("Chili Chicken", 19.90), ("Hähnchenbrust überbacken mit Mozzarella", 19.90),
        ("gefülltes Hähnchenbrustfilet", 27.90), ("Hähnchenbrustfilet Spezial", 29.90),
        ("Toscana Hähnchenschnitzel", 24.90), ("Maispoularde", 27.90),
        ("Entenbrust", 29.90), ("Zartes Entenbrustfilet", 29.90),
        ("halbe Ente", 24.90), ("gegrillte Entenkeule", 25.90),
        ("Duroc-Schweinefilet", 29.90), ("Rehrücken", 34.90),
        ("zart gebratener Rehrücken", 34.90), ("zart geschmortes Rehgulasch", 24.90),
        ("Mini Lammhaxe", 27.90), ("Lamm Karreeee", 32.90),
        ("ganze Gans für 4 Personen", 120.00),
        ("Carne Bandnudeln", 19.90), ("Tagliatelle", 25.90),
        ("Tagliatelle Spezial", 25.90), ("Penne a la arrabiata", 13.90),
        ("Nudeln mit Tomatensauce", 9.90), ("Pad Thai Nudeln", 21.90),
        ("Pasta", 29.90), ("Hähnchen süß/sauer", 19.90),
        ("gebackene Süßkartoffel", 17.90), ("Gemüseeintopf", 14.90),
        ("Mexikanische Pfanne", 13.90), ("Toscana Reispfanne", 24.90),
        ("Wurst & Käseplatte Das ELB", 15.90),
    ],
    "Indische Karte": [
        ("Aloo Gobi", 19.90), ("Butter Chicken", 22.90),
        ("Chili Chicken", 19.90), ("Fisch Pakora", 22.90),
        ("indische Bowl", 18.90), ("Indische Linsensuppe", 9.90),
        ("indische Vorspeise", 13.90), ("Jalfraise mit Hähnchen", 19.80),
        ("Jalfraise mit Riesengarnelen", 21.80), ("Jalfraise vegetarisch", 15.90),
        ("Kichererbsen", 15.90), ("Kürbis Kokos Curry", 24.90),
        ("Lachs Tikka", 25.90), ("Lemon Chicken", 19.90),
        ("Lemon Koriander Suppe", 14.90),
        ("Nudelpfanne mit Hähnchen", 19.80), ("Nudelpfanne mit Riesengarnelen", 21.80),
        ("Sabzi Pachrangi", 19.90), ("Vegan Curry", 19.90), ("Veggi Curry", 19.90),
    ],
    "Dessert": [
        ("Cheese Cake", 9.90), ("Creme Brulee mit Wallnusseis", 9.90),
        ("Crépe Törtchen", 9.90), ("Crepes", 4.90),
        ("hausgemachtes Kaiserschmarrn", 14.90), ("Kaiserschmarrn", 13.90),
        ("Lavakuchen auf Mangopüree", 13.90),
        ("Minz-Pana Cotta mit Crunch und Erdbeeren", 9.50),
        ("Milchreis Bowl", 9.90), ("Kuchen nach Angebot", 4.50),
        ("Streuselkuchen", 4.90), ("Kugel Eis", 1.60),
        ("Eiscafé", 6.90), ("Heiße Himbeere Eisbecher", 7.90),
        ("Erdbeer-Becher (mit Sahne)", 7.90), ("Schoko-Becher (mit Sahne)", 7.90),
        ("Nuß-Becher (mit Sahne)", 7.90), ("Rocher-Becher (mit Sahne)", 7.90),
        ("Schweden-Becher (mit Sahne)", 7.90), ("Früchte-Becher (mit Sahne)", 7.90),
        ("Eierlikör-Becher (mit Sahne)", 7.90),
        ("Eis mit heißen Himbeeren (mit Sahne)", 7.90),
        ("versch. Torten", 7.90),
    ],
    "Bowls": [
        ("Arabische Bowl", 15.90), ("Veggie Bowl", 15.90),
        ("Tango Mango", 14.90),
    ],
    "Buffets": [
        ("Frühstücksbuffet", 20.00), ("Grillbuffet", 39.90),
        ("Glühwein-Grillbuffet", 34.90), ("Wagyu-Grillbuffet", 79.90),
        ("Weekend Buffet", 34.90), ("Weihnachtsbuffet", 59.90),
        ("Weihnachtsbuffet Kids", 24.90), ("Silvesterbuffet", 49.90),
        ("Osterbuffet", 49.90), ("Pfingst-Buffet", 39.90),
        ("Frauentagsbuffet", 39.90), ("Das ELB Winter Buffet", 19.90),
        ("Kuchenbuffet", 19.90), ("Kinder Buffet", 17.50),
        ("Chef Spezial", 34.90), ("Gentlemen Club", 59.90),
        ("Frühstück Walk-In", 30.00),
    ],
    "Kindergerichte": [
        ("Chicken Nuggets", 9.90), ("Wiener Schnitzel (klein)", 9.90),
        ("Hähnchenbrustfilet", 9.90), ("Hähnchensteak", 9.90),
    ],
    "Spargelkarte": [
        ("Spargel mit Butterkartoffeln", 19.90), ("Spargel mit Kräuterpolenta", 24.90),
        ("Spargel mit Schwarzwaldschinken", 19.90), ("Spargel mit Bacon", 17.90),
        ("Spargel-Kartoffelpuffer", 21.90), ("frittierter Spargel", 13.90),
        ("Spargelbeilage", 9.90), ("Spargelbeilage mit Sauce Hollandaise", 11.90),
    ],
    "Frühstück": [
        ("Dubai Pancakes", 13.90), ("Frühstücksbuffet", 20.00),
    ],
    "Dubai Schokolade": [
        ("Dubai Schokolade mit Blattgold", 9.90), ("Dubai Tafel", 6.00),
    ],
}

# ── Smoothies & Lassis (add to Alkoholfreie Getränke) ──
ITEMS_BY_CATEGORY["Alkoholfreie Getränke"].extend([
    ("Golden Glow Smoothie", 8.90), ("Green Stadtpark Smoothie", 8.90),
    ("Berry Splash Smoothie", 8.20), ("Mango Lassi", 8.90),
    ("Coconut Lassi", 8.90), ("Cherry Blossom Lassi", 8.50),
    ("Kesar Glow", 8.90), ("Mango Royale Lassi", 7.90),
    ("Bollywood Banana Shake", 8.90), ("Kulfi Crush Shake", 9.50),
    ("Strawberry Basil Shake", 8.90), ("Watermelon Masala Pop", 7.20),
    ("Mixi Refresher", 8.50), ("Classic Laly Lemon", 5.50),
    ("Spicy Mango", 7.50), ("Evolution", 7.50),
    ("Kiss from the Rose", 7.20), ("Peach Garden", 6.90),
    ("Laly Lime Smash", 6.90), ("Lavendel Lemonade", 6.20),
    ("Kiwi Cooler", 5.90), ("Summer Cooler", 5.80),
    ("Rosen-Litschi Limo", 5.90),
])

# ── Reservations data (anonymized — real PII removed for GDPR compliance) ──
RESERVATIONS = [
    {"time": "2026-03-02 11:30", "people": 2, "first": "Max", "last": "Mustermann", "email": "max.mustermann@example.de", "phone": "+49 391 5550101"},
    {"time": "2026-03-02 17:00", "people": 2, "first": "", "last": "Guest-A", "email": "", "phone": ""},
    {"time": "2026-03-02 18:30", "people": 5, "first": "", "last": "Verein", "email": "", "phone": ""},
    {"time": "2026-03-03 12:30", "people": 8, "first": "", "last": "Dr. Beispiel", "email": "", "phone": ""},
    {"time": "2026-03-03 13:30", "people": 3, "first": "", "last": "Guest-B", "email": "", "phone": ""},
    {"time": "2026-03-03 18:30", "people": 4, "first": "Andreas", "last": "Beispiel", "email": "andreas.beispiel@example.de", "phone": "+49 170 5550102"},
    {"time": "2026-03-03 19:00", "people": 3, "first": "Martin", "last": "Schmidt", "email": "martin.schmidt@example.de", "phone": "+49 170 5550103"},
    {"time": "2026-03-04 18:00", "people": 4, "first": "Robert", "last": "Mueller", "email": "robert.mueller@example.de", "phone": "+49 171 5550104"},
    {"time": "2026-03-04 18:00", "people": 3, "first": "Julia", "last": "Fischer", "email": "julia.fischer@example.de", "phone": "+49 178 5550105"},
    {"time": "2026-03-04 18:00", "people": 6, "first": "", "last": "Guest-C", "email": "guest.c@example.de", "phone": ""},
    {"time": "2026-03-04 18:00", "people": 5, "first": "Anne", "last": "Weber", "email": "anne.weber@example.de", "phone": "+49 162 5550106"},
    {"time": "2026-03-04 18:30", "people": 4, "first": "Gina", "last": "Meyer", "email": "gina.meyer@example.de", "phone": "+49 172 5550107"},
    {"time": "2026-03-04 18:30", "people": 2, "first": "Juergen", "last": "Braun", "email": "juergen.braun@example.de", "phone": "+49 171 5550108"},
    {"time": "2026-03-04 18:30", "people": 4, "first": "Viet", "last": "Tran", "email": "viet.tran@example.de", "phone": "+49 152 5550109"},
    {"time": "2026-03-04 19:00", "people": 2, "first": "Emily", "last": "Wagner", "email": "emily.wagner@example.de", "phone": "+49 176 5550110"},
    {"time": "2026-03-05 12:00", "people": 2, "first": "Holger", "last": "Schmidt", "email": "holger.schmidt@example.de", "phone": ""},
    {"time": "2026-03-05 18:00", "people": 4, "first": "", "last": "Guest-D", "email": "", "phone": ""},
    {"time": "2026-03-05 18:00", "people": 2, "first": "Katja", "last": "Becker", "email": "", "phone": ""},
    {"time": "2026-03-06 17:30", "people": 20, "first": "", "last": "Guest-E", "email": "", "phone": ""},
    {"time": "2026-03-06 17:30", "people": 4, "first": "", "last": "Guest-F", "email": "", "phone": ""},
    {"time": "2026-03-06 18:00", "people": 4, "first": "Elvira", "last": "Gross", "email": "", "phone": ""},
    {"time": "2026-03-06 18:00", "people": 9, "first": "", "last": "Guest-G", "email": "", "phone": ""},
    {"time": "2026-03-06 18:30", "people": 15, "first": "Clemens", "last": "Hoffmann", "email": "clemens.hoffmann@example.de", "phone": "+49 162 5550111"},
    {"time": "2026-03-06 18:30", "people": 4, "first": "Christian", "last": "Klein", "email": "christian.klein@example.de", "phone": "+49 157 5550112"},
    {"time": "2026-03-06 19:00", "people": 5, "first": "Irwin", "last": "Wolf", "email": "irwin.wolf@example.de", "phone": "+49 172 5550113"},
    {"time": "2026-03-06 19:00", "people": 8, "first": "Michael", "last": "Richter", "email": "michael.richter@example.de", "phone": "+49 170 5550114"},
    {"time": "2026-03-07 11:30", "people": 6, "first": "", "last": "Guest-H", "email": "", "phone": ""},
    {"time": "2026-03-07 11:30", "people": 6, "first": "Mandy", "last": "Lange", "email": "mandy.lange@example.de", "phone": "+49 151 5550115"},
    {"time": "2026-03-07 11:30", "people": 8, "first": "", "last": "Guest-I", "email": "", "phone": ""},
    {"time": "2026-03-07 12:00", "people": 10, "first": "Maik", "last": "Heuer", "email": "maik.heuer@example.de", "phone": "+49 177 5550116"},
    {"time": "2026-03-07 18:00", "people": 2, "first": "", "last": "Guest-J", "email": "", "phone": ""},
    {"time": "2026-03-07 18:00", "people": 6, "first": "", "last": "Guest-K", "email": "", "phone": ""},
    {"time": "2026-03-07 18:30", "people": 2, "first": "Jens", "last": "Koch", "email": "jens.koch@example.de", "phone": "+49 177 5550117"},
    {"time": "2026-03-07 18:30", "people": 6, "first": "Elvira", "last": "Gross", "email": "elvira.gross@example.de", "phone": "+49 178 5550118"},
    {"time": "2026-03-08 11:30", "people": 2, "first": "Gunda", "last": "Hartmann", "email": "gunda.hartmann@example.de", "phone": "+49 170 5550119"},
    {"time": "2026-03-08 11:30", "people": 4, "first": "Lutz", "last": "Schroeder", "email": "lutz.schroeder@example.de", "phone": "+49 160 5550120"},
    {"time": "2026-03-08 11:30", "people": 9, "first": "", "last": "Guest-L", "email": "", "phone": ""},
    {"time": "2026-03-08 11:30", "people": 14, "first": "", "last": "Guest-M", "email": "", "phone": ""},
    {"time": "2026-03-08 11:30", "people": 6, "first": "Ilze", "last": "Schulz", "email": "ilze.schulz@example.de", "phone": "+49 176 5550121"},
    {"time": "2026-03-08 11:30", "people": 10, "first": "Sebastian", "last": "Frank", "email": "sebastian.frank@example.de", "phone": "+49 151 5550122"},
    {"time": "2026-03-08 11:30", "people": 17, "first": "", "last": "Guest-N", "email": "guest.n@example.de", "phone": ""},
    {"time": "2026-03-08 11:30", "people": 6, "first": "", "last": "Guest-O", "email": "", "phone": ""},
    {"time": "2026-03-08 11:30", "people": 2, "first": "", "last": "Guest-P", "email": "", "phone": ""},
    {"time": "2026-03-08 11:30", "people": 8, "first": "", "last": "Guest-Q", "email": "", "phone": ""},
    {"time": "2026-03-08 12:30", "people": 2, "first": "Dagmar", "last": "Zimmermann", "email": "dagmar.zimmermann@example.de", "phone": "+49 171 5550123"},
    {"time": "2026-03-08 12:30", "people": 2, "first": "Helmtrud", "last": "Krause", "email": "helmtrud.krause@example.de", "phone": "+49 391 5550124"},
    {"time": "2026-03-08 12:30", "people": 4, "first": "Ingrid", "last": "Schulze", "email": "ingrid.schulze@example.de", "phone": "+49 175 5550125"},
    {"time": "2026-03-08 17:00", "people": 4, "first": "Frauke", "last": "Peters", "email": "frauke.peters@example.de", "phone": "+49 176 5550126"},
    {"time": "2026-03-08 17:00", "people": 5, "first": "", "last": "Guest-R", "email": "", "phone": ""},
    {"time": "2026-03-08 17:30", "people": 2, "first": "", "last": "Guest-S", "email": "", "phone": ""},
    {"time": "2026-03-08 17:30", "people": 4, "first": "Ronald", "last": "Werner", "email": "ronald.werner@example.de", "phone": "+49 171 5550127"},
    {"time": "2026-03-08 18:00", "people": 2, "first": "", "last": "Guest-T", "email": "", "phone": ""},
]


async def main():
    print("=" * 60)
    print("  Gastronovi → Gestronomy Data Import")
    print("=" * 60)

    async with async_session() as db:
        # ── 1. Clear existing menu data ──
        print("\n[1/5] Clearing existing menu data...")
        await db.execute(text("DELETE FROM menu_item_modifiers"))
        await db.execute(text("DELETE FROM upsell_rules"))
        await db.execute(text("DELETE FROM menu_items"))
        await db.execute(text("DELETE FROM menu_categories"))
        await db.commit()
        print("  ✓ Cleared menu_items, menu_categories")

        # ── 2. Insert categories ──
        print("\n[2/5] Creating menu categories...")
        cat_map = {}
        for cat_data in CATEGORIES:
            cat = MenuCategory(**cat_data)
            db.add(cat)
            await db.flush()
            cat_map[cat_data["name"]] = cat.id
            print(f"  ✓ {cat_data['name']} (id={cat.id})")
        await db.commit()
        print(f"  → {len(cat_map)} categories created")

        # ── 3. Insert menu items ──
        print("\n[3/5] Importing menu items...")
        total_items = 0
        for cat_name, items in ITEMS_BY_CATEGORY.items():
            cat_id = cat_map.get(cat_name)
            if not cat_id:
                print(f"  ⚠ Category '{cat_name}' not found, skipping {len(items)} items")
                continue
            for idx, (name, price) in enumerate(items):
                item = MenuItem(
                    category_id=cat_id,
                    name=name,
                    price=Decimal(str(price)),
                    cost=Decimal("0"),
                    is_available=True,
                    sort_order=idx,
                )
                db.add(item)
                total_items += 1
        await db.commit()
        print(f"  → {total_items} menu items imported across {len(ITEMS_BY_CATEGORY)} categories")

        # ── 4. Ensure floor section and tables exist ──
        print("\n[4/5] Setting up floor section...")
        result = await db.execute(select(FloorSection).limit(1))
        section = result.scalar_one_or_none()
        if not section:
            section = FloorSection(name="Restaurant", description="Main dining area", sort_order=1)
            db.add(section)
            await db.flush()
            # Create some tables
            for i in range(1, 21):
                cap = 2 if i <= 8 else (4 if i <= 14 else (6 if i <= 18 else 10))
                t = Table(
                    section_id=section.id,
                    table_number=str(i),
                    capacity=cap,
                    min_capacity=1,
                    status="available",
                )
                db.add(t)
            await db.commit()
            print(f"  ✓ Created floor section + 20 tables")
        else:
            print(f"  ✓ Floor section already exists (id={section.id})")

        # ── 5. Import reservations ──
        print("\n[5/5] Importing reservations...")
        # Clear future reservations first
        await db.execute(text("DELETE FROM reservations WHERE reservation_date >= '2026-03-02'"))
        await db.commit()

        imported = 0
        for r in RESERVATIONS:
            dt = r["time"].split(" ")
            res_date = date.fromisoformat(dt[0])
            h, m = dt[1].split(":")
            res_time = time(int(h), int(m))
            guest_name = f"{r['first']} {r['last']}".strip()
            if not guest_name:
                guest_name = "Walk-in"

            reservation = Reservation(
                guest_name=guest_name,
                guest_phone=r.get("phone") or None,
                guest_email=r.get("email") or None,
                party_size=r["people"],
                reservation_date=res_date,
                start_time=res_time,
                duration_min=90,
                status="confirmed",
                source="gastronovi",
            )
            db.add(reservation)
            imported += 1

        await db.commit()
        print(f"  → {imported} reservations imported")

        # ── Summary ──
        cat_count = (await db.execute(text("SELECT COUNT(*) FROM menu_categories"))).scalar()
        item_count = (await db.execute(text("SELECT COUNT(*) FROM menu_items"))).scalar()
        res_count = (await db.execute(text("SELECT COUNT(*) FROM reservations"))).scalar()

        print("\n" + "=" * 60)
        print("  Import Complete!")
        print(f"  Categories:   {cat_count}")
        print(f"  Menu Items:   {item_count}")
        print(f"  Reservations: {res_count}")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
