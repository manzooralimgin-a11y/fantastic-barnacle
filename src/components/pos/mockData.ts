import type { Table, MenuItem, OrderItem } from './types';

export const MOCK_TABLES: Table[] = [
  // Row 1 — Main Dining top
  { id: 't1', number: 1, shape: 'round',  status: 'occupied',  seats: 2, x: 10, y: 16, elapsed_minutes: 42, ready_item_count: 2, orderId: 'ord-1',  label: 'T1' },
  { id: 't2', number: 2, shape: 'square', status: 'available', seats: 4, x: 26, y: 16, elapsed_minutes: 0,  ready_item_count: 0,                     label: 'T2' },
  { id: 't3', number: 3, shape: 'round',  status: 'reserved',  seats: 6, x: 44, y: 16, elapsed_minutes: 0,  ready_item_count: 0,                     label: 'T3' },
  { id: 't4', number: 4, shape: 'square', status: 'occupied',  seats: 4, x: 62, y: 16, elapsed_minutes: 18, ready_item_count: 0, orderId: 'ord-4',  label: 'T4' },
  { id: 't5', number: 5, shape: 'round',  status: 'cleaning',  seats: 2, x: 80, y: 16, elapsed_minutes: 5,  ready_item_count: 0,                     label: 'T5' },
  // Row 2 — Main Dining mid
  { id: 't6', number: 6, shape: 'square', status: 'available', seats: 8, x: 10, y: 48, elapsed_minutes: 0,  ready_item_count: 0,                     label: 'T6' },
  { id: 't7', number: 7, shape: 'round',  status: 'occupied',  seats: 4, x: 30, y: 48, elapsed_minutes: 67, ready_item_count: 1, orderId: 'ord-7',  label: 'T7' },
  { id: 't8', number: 8, shape: 'square', status: 'blocked',   seats: 4, x: 50, y: 48, elapsed_minutes: 0,  ready_item_count: 0,                     label: 'T8' },
  { id: 't9', number: 9, shape: 'round',  status: 'available', seats: 2, x: 68, y: 48, elapsed_minutes: 0,  ready_item_count: 0,                     label: 'T9' },
  { id: 't10',number: 10,shape: 'square', status: 'occupied',  seats: 6, x: 86, y: 48, elapsed_minutes: 31, ready_item_count: 3, orderId: 'ord-10', label: 'T10' },
  // Row 3 — Terrace
  { id: 't11',number: 11,shape: 'round',  status: 'reserved',  seats: 2, x: 16, y: 80, elapsed_minutes: 0,  ready_item_count: 0,                     label: 'T11' },
  { id: 't12',number: 12,shape: 'square', status: 'available', seats: 4, x: 38, y: 80, elapsed_minutes: 0,  ready_item_count: 0,                     label: 'T12' },
  { id: 't13',number: 13,shape: 'round',  status: 'occupied',  seats: 2, x: 60, y: 80, elapsed_minutes: 9,  ready_item_count: 0, orderId: 'ord-13', label: 'T13' },
  { id: 't14',number: 14,shape: 'square', status: 'cleaning',  seats: 4, x: 80, y: 80, elapsed_minutes: 3,  ready_item_count: 0,                     label: 'T14' },
];

export const MENU_CATEGORIES = ['All', 'Starters', 'Mains', 'Desserts', 'Drinks'];

export const MOCK_MENU_ITEMS: MenuItem[] = [
  // Starters
  { id: 'm1', name: 'Elbe Bouillabaisse', description: 'Fresh North Sea fish, saffron broth, rouille', price: 14.5, category: 'Starters', dietary: ['GF'], available: true, emoji: '🍲' },
  { id: 'm2', name: 'Burrata & Heirloom', description: 'Whipped burrata, heirloom tomatoes, basil oil', price: 13.0, category: 'Starters', dietary: ['V', 'GF'], available: true, emoji: '🥗' },
  { id: 'm3', name: 'Shrimp Tatar', description: 'Nordic shrimp, dill cream, cucumber, rye crouton', price: 16.0, category: 'Starters', dietary: [], available: true, emoji: '🍤' },
  { id: 'm4', name: 'Mushroom Velouté', description: 'Wild mushrooms, truffle oil, brioche croutons', price: 11.5, category: 'Starters', dietary: ['V', 'VG'], available: true, emoji: '🍄' },
  { id: 'm5', name: 'Bread & Butter Board', description: 'Sourdough, cultured butter, sea salt, honey', price: 7.0, category: 'Starters', dietary: ['V'], available: true, emoji: '🍞' },

  // Mains
  { id: 'm6', name: 'Dry-Aged Hamburg Steak', description: '250g prime beef, herb butter, roasted potatoes', price: 38.0, category: 'Mains', dietary: ['GF'], available: true, emoji: '🥩' },
  { id: 'm7', name: 'Elbe Salmon', description: 'Pan-seared salmon, lemon beurre blanc, asparagus', price: 32.0, category: 'Mains', dietary: ['GF'], available: true, emoji: '🐟' },
  { id: 'm8', name: 'Wiener Schnitzel', description: 'Classic veal, cranberry, parsley butter, Spätzle', price: 29.0, category: 'Mains', dietary: [], available: true, emoji: '🍽️' },
  { id: 'm9', name: 'Truffle Risotto', description: 'Carnaroli rice, black truffle, aged Parmesan', price: 26.0, category: 'Mains', dietary: ['V', 'GF'], available: true, emoji: '🌾' },
  { id: 'm10', name: 'Duck Confit', description: 'Slow-cooked leg, cherry jus, red cabbage, potato rösti', price: 34.0, category: 'Mains', dietary: ['GF'], available: true, emoji: '🦆' },
  { id: 'm11', name: 'Garden Pasta', description: 'Handmade tagliatelle, seasonal vegetables, herb pesto', price: 22.0, category: 'Mains', dietary: ['V', 'VG'], available: false, emoji: '🍝' },

  // Desserts
  { id: 'm12', name: 'Dark Chocolate Fondant', description: 'Warm 70% chocolate, vanilla bean ice cream', price: 12.0, category: 'Desserts', dietary: ['V'], available: true, emoji: '🍫' },
  { id: 'm13', name: 'Crème Brûlée', description: 'Classic vanilla custard, caramelised sugar crust', price: 10.0, category: 'Desserts', dietary: ['V', 'GF'], available: true, emoji: '🍮' },
  { id: 'm14', name: 'Lemon Tart', description: 'Curd, Swiss meringue, candied zest, sorbet', price: 11.0, category: 'Desserts', dietary: ['V'], available: true, emoji: '🍋' },
  { id: 'm15', name: 'Cheese Selection', description: 'Three German and French cheeses, quince jelly, crackers', price: 16.0, category: 'Desserts', dietary: ['V', 'GF'], available: true, emoji: '🧀' },

  // Drinks
  { id: 'm16', name: 'Riesling Spätlese', description: 'Mosel Valley, 2022 — glass', price: 9.5, category: 'Drinks', dietary: ['V', 'VG', 'GF'], available: true, emoji: '🍷' },
  { id: 'm17', name: 'Craft Lager', description: 'Hamburg local brew, 0.4L draught', price: 5.5, category: 'Drinks', dietary: ['V', 'VG'], available: true, emoji: '🍺' },
  { id: 'm18', name: 'Elbe Signature Cocktail', description: 'Gin, elderflower, cucumber, tonic', price: 13.0, category: 'Drinks', dietary: ['V', 'VG', 'GF'], available: true, emoji: '🍸' },
  { id: 'm19', name: 'Still / Sparkling Water', description: 'Mineral water, 0.75L', price: 4.5, category: 'Drinks', dietary: ['V', 'VG', 'GF'], available: true, emoji: '💧' },
  { id: 'm20', name: 'Espresso Doppio', description: 'Double shot, freshly ground specialty beans', price: 4.0, category: 'Drinks', dietary: ['V', 'VG', 'GF'], available: true, emoji: '☕' },
];

export const MOCK_ACTIVE_ORDER: OrderItem[] = [
  { id: 'oi1', menuItem: MOCK_MENU_ITEMS[0], quantity: 2, status: 'served' },
  { id: 'oi2', menuItem: MOCK_MENU_ITEMS[6], quantity: 1, status: 'ready' },
  { id: 'oi3', menuItem: MOCK_MENU_ITEMS[9], quantity: 1, status: 'preparing' },
  { id: 'oi4', menuItem: MOCK_MENU_ITEMS[16], quantity: 2, status: 'served' },
  { id: 'oi5', menuItem: MOCK_MENU_ITEMS[19], quantity: 2, status: 'preparing' },
];
