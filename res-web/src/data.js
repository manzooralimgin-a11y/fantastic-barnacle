// --- Globale Ästhetik & Konstanten ---
export const NAVY_BG = "radial-gradient(circle at center, #00050B 0%, #000C1D 100%)";
export const GOLD_GRADIENT = "linear-gradient(45deg, #BF953F, #FCF6BA, #B38728, #FBF5B7, #AA771C)";
export const GLASS_BG = "rgba(255, 255, 255, 0.06)";
export const BURGUNDY = "#800020";
export const LOGO_URL = "/daselb-logo.png";
export const HOME_HERO_IMAGE = "https://i.imgur.com/qZaaOhU.png";
export const MENU_DATA = {
    "WINTER MENU": [
        { name: "Kürbiscremesuppe", price: "€15.90", desc: "Samtige Suppe | Kürbiskernöl | geröstete Kürbiskerne (Vegan/Veg.)", img: "https://images.unsplash.com/photo-1547592166-23ac45744acd?q=80&w=800" },
        { name: "Kartoffelrahmsuppe", price: "€14.90", desc: "Cremige Suppe mit frischen Kräutern", img: "https://images.unsplash.com/photo-1547592116-fb29b015383f?q=80&w=800" },
        { name: "Rindertartar", price: "€19.90", desc: "Frisches Rindertatar | Wachtelei | geröstetes Brot", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800" },
        { name: "Chicorée-Salat", price: "€14.90", desc: "Gerösteter Chicorée | knuspriger Speck | milder Honig | Walnüsse", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800" },
        { name: "Pilz Bruschetta", price: "€14.90", desc: "Knuspriges Brot | gebratene Wildpilze | Zwiebel-Chutney", img: "https://images.unsplash.com/photo-1506280754576-f6fa8a873550?q=80&w=800" },
        { name: "Entenbrustfilet", price: "€29.90", desc: "Zartes Filet | Orangensauce | Pistazienknödel | karamellisierter Wildbrokkoli", img: "https://images.unsplash.com/photo-1512058560366-cd24295984c7?q=80&w=800" },
        { name: "Rehrücken", price: "€34.90", desc: "Zart gebratener Rehrücken | Jus | karamellisierter Wildbrokkoli | Sellerie-Kartoffel-Püree", img: "https://images.unsplash.com/photo-1594041680534-e8c8cdebd659?q=80&w=800" },
        { name: "Rehgulasch", price: "€24.90", desc: "Zart geschmort | Serviettenknödel | Apfelrotkohl", img: "https://images.unsplash.com/photo-1534422298391-e4f8c170db76?q=80&w=800" },
        { name: "Zanderfilet", price: "€29.90", desc: "Knusprig gebraten | Safranrisotto | grüner Spargel", img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?q=80&w=800" },
        { name: "Lachsfilet", price: "€29.90", desc: "Goldbraun knusprig | Zitronen-Kräuter-Quinoa | glasiertes Gemüse", img: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=800" }
    ],
    "LUNCH SPECIALS": [
        { name: "Tomatencremesuppe", price: "€9.90", desc: "Klassisch cremige Tomatensuppe", img: "https://images.unsplash.com/photo-1547592166-23ac45744acd?q=80&w=800" },
        { name: "Gegrillte Dorade", price: "€24.90", desc: "Sizilianische Art | Cherrytomaten | Chili | Oliven | Paprika | Babykartoffeln", img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?q=80&w=800" },
        { name: "Rinderroulade", price: "€14.90", desc: "Hausgemacht | herzhafte Sauce | Kartoffelstampf", img: "https://images.unsplash.com/photo-1594041680534-e8c8cdebd659?q=80&w=800" },
        { name: "Gegrillte Rinderleber", price: "€12.90", desc: "Mit Zwiebeln | Apfelstücken | Kartoffelstampf", img: "https://images.unsplash.com/photo-1594041680534-e8c8cdebd659?q=80&w=800" },
        { name: "Mexikanische Pfanne", price: "€13.90", desc: "Fleischmix | Mais | Kidneybohnen | Paprika | Basmatireis", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800" },
        { name: "Tango Mango", price: "€13.90", desc: "Hähnchen file mit Mango Curry Sauce & Basmati Reis", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800" }
    ],
    "INDIAN CUISINE": [
        { name: "Butter Chicken", price: "€22.90", desc: "Indischer Klassiker | cremige Tomaten-Butter-Sauce", img: "https://images.unsplash.com/photo-1603894584714-f483fc129321?q=80&w=800" },
        { name: "Sabzi Pachrangi", price: "€19.90", desc: "Gemischtes Gemüse | Kartoffeln | Currysauce | Cashews | Rosinen", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800" },
        { name: "Aloo Gobi", price: "€19.90", desc: "Blumenkohl & Kartoffeln in Currysauce", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800" },
        { name: "Lemon Chicken", price: "€19.90", desc: "Zartes Hähnchen in feiner Zitronen-Currysauce", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800" },
        { name: "Chicken Spinaci", price: "€19.90", desc: "Hähnchenbrust in würziger Spinat-Currysauce", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800" },
        { name: "Kerala Greens Curry", price: "€17.50", desc: "Spinatsauce | Kokos | Curryblätter | grüne Chili | Basmatireis", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800" }
    ],
    "SIGNATURE DISHES": [
        { name: "The Crown Steak", price: "€89.90", desc: "150g A5 Kobe Wagyu | Blattgold | Pastinaken-Kartoffel-Püree | Yuzu-Trüffel-Butter", img: "https://images.unsplash.com/photo-1600891964092-4316c288032e?q=80&w=800" },
        { name: "Meat Me in the Tropics", price: "€45.90", desc: "Argentinisches Rinderfilet | Mango-Chili-Salsa | Süßkartoffel | grüner Spargel", img: "https://images.unsplash.com/photo-1600891964092-4316c288032e?q=80&w=800" },
        { name: "La Canette Sauvage", price: "€29.90", desc: "Rosa Entenbrust | Orangen-Blaubeer-Jus | Sommergemüse | Kartoffelpüree", img: "https://images.unsplash.com/photo-1512058560366-cd24295984c7?q=80&w=800" },
        { name: "Small Bird. Big Flavor", price: "€28.90", desc: "Perlhuhn | Cranberry-Orange-Sauce | Wildbrokkoli | Sellerie-Püree", img: "https://images.unsplash.com/photo-1512058560366-cd24295984c7?q=80&w=800" }
    ],
    "DESSERTS": [
        { name: "Rasmalai Tiramisu", price: "€12.90", desc: "Kardamom-Biskuit | Chai-Zimt-Sirup | Pistazien-Mascarpone | essbares Gold", img: "https://images.unsplash.com/photo-1579372782352-78d12bd750f2?q=80&w=800" },
        { name: "Golden Kaiser", price: "€17.90", desc: "Kaiserschmarrn | Rosenwasser | Blattgold | Apfelmus oder Pistazien-Crème", img: "https://images.unsplash.com/photo-1470333732907-0516ca8d08fe?q=80&w=800" },
        { name: "Chill Laly Bites", price: "€13.90", desc: "Mango-Kulfi-Würfel | Chili-Crunch | Goldstaub | Karamell oder Pistazie", img: "https://images.unsplash.com/photo-1488477181946-6428a0291777?q=80&w=800" },
        { name: "Dubai Pancakes", price: "€13.90", desc: "Fluffige Pancakes mit Dubai Schokolade & Toppings", img: "https://images.unsplash.com/photo-1506084868430-35718df2612a?q=80&w=800" }
    ],
    "DRINKS": [
        { name: "Bollywood Negroni", price: "€13.50", desc: "Gin | Rosé Vermouth | Campari | Rosenwasser", img: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800" },
        { name: "Blue Elbe", price: "€10.90", desc: "Gin | Zitrone | Coconut Cream | Ananas", img: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800" },
        { name: "Mango Royale Lassi", price: "€7.90", desc: "Samtiger Mango-Lassi mit frischer Minze", img: "https://images.unsplash.com/photo-1546173159-315724a31696?q=80&w=800" },
        { name: "Aperol Spritz", price: "€8.90", desc: "Der Klassiker | Aperol | Prosecco | Soda", img: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800" },
        { name: "Moët & Chandon", price: "€99.00", desc: "Impérial Brut (0,75l)", img: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800" }
    ]
};

