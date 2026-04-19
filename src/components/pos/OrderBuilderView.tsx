'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Trash2, Send, ShoppingCart, AlertCircle } from 'lucide-react';
import type { CartItem, MenuItem, DietaryBadge } from './types';
import { MOCK_MENU_ITEMS, MENU_CATEGORIES } from './mockData';

const DIETARY_CONFIG: Record<DietaryBadge, { label: string; color: string; bg: string }> = {
  V: { label: 'V', color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/30' },
  VG: { label: 'VG', color: 'text-lime-400', bg: 'bg-lime-500/15 border-lime-500/30' },
  GF: { label: 'GF', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' },
};

interface MenuItemCardProps {
  item: MenuItem;
  cartQty: number;
  onAdd: (item: MenuItem) => void;
  onRemove: (id: string) => void;
}

function MenuItemCard({ item, cartQty, onAdd, onRemove }: MenuItemCardProps) {
  return (
    <motion.div
      layout
      whileTap={item.available ? { scale: 0.97 } : {}}
      className={`relative flex flex-col rounded-xl overflow-hidden transition-opacity ${!item.available ? 'opacity-40' : ''}`}
      style={{
        background: 'rgba(10,26,20,0.55)',
        backdropFilter: 'blur(10px)',
        border: cartQty > 0
          ? '1px solid rgba(200,169,81,0.4)'
          : '1px solid rgba(255,255,255,0.08)',
        boxShadow: cartQty > 0 ? '0 0 12px rgba(200,169,81,0.15)' : 'none',
      }}
    >
      {/* Emoji header */}
      <div
        className="flex items-center justify-center h-16 text-3xl"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        {item.emoji}
      </div>

      <div className="flex flex-col gap-1.5 p-3 flex-1">
        <div className="flex items-start justify-between gap-1">
          <span className="text-sm font-semibold text-white/90 leading-tight">{item.name}</span>
          <span className="text-sm font-bold text-accent shrink-0">€{item.price.toFixed(2)}</span>
        </div>
        <p className="text-[11px] text-white/40 leading-snug line-clamp-2">{item.description}</p>

        {/* Dietary badges */}
        {item.dietary.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-0.5">
            {item.dietary.map((d) => (
              <span
                key={d}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${DIETARY_CONFIG[d].bg} ${DIETARY_CONFIG[d].color}`}
              >
                {DIETARY_CONFIG[d].label}
              </span>
            ))}
          </div>
        )}

        {!item.available && (
          <div className="flex items-center gap-1 text-[11px] text-red-400/70 mt-1">
            <AlertCircle size={10} />
            <span>Unavailable</span>
          </div>
        )}
      </div>

      {/* Add / qty controls */}
      {item.available && (
        <div className="px-3 pb-3">
          {cartQty === 0 ? (
            <button
              onClick={() => onAdd(item)}
              className="w-full h-9 rounded-lg flex items-center justify-center gap-1.5 text-sm font-semibold text-accent transition-all active:scale-95 min-h-[44px]"
              style={{ background: 'rgba(200,169,81,0.15)', border: '1px solid rgba(200,169,81,0.3)' }}
            >
              <Plus size={14} />
              Add
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => onRemove(item.id)}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-95 min-w-[44px] min-h-[44px]"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <Minus size={14} className="text-red-400" />
              </button>
              <span className="text-white font-bold text-base">{cartQty}</span>
              <button
                onClick={() => onAdd(item)}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-95 min-w-[44px] min-h-[44px]"
                style={{ background: 'rgba(200,169,81,0.15)', border: '1px solid rgba(200,169,81,0.3)' }}
              >
                <Plus size={14} className="text-accent" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* In-cart indicator dot */}
      {cartQty > 0 && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-[#0A1A14] shadow-[0_0_8px_rgba(200,169,81,0.5)]">
          {cartQty}
        </div>
      )}
    </motion.div>
  );
}

interface CartPanelProps {
  cart: CartItem[];
  tableNumber: number;
  onAdd: (item: MenuItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSendToKitchen: () => void;
}

function CartPanel({ cart, tableNumber, onAdd, onRemove, onClear, onSendToKitchen }: CartPanelProps) {
  const subtotal = cart.reduce((acc, ci) => acc + ci.menuItem.price * ci.quantity, 0);

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgba(8,20,14,0.7)', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Cart header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart size={16} className="text-accent" />
          <span className="font-semibold text-white/90 text-sm">Table {tableNumber} — Order</span>
        </div>
        {cart.length > 0 && (
          <button
            onClick={onClear}
            className="text-[11px] text-white/30 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <Trash2 size={11} />
            Clear
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
        <AnimatePresence initial={false}>
          {cart.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full py-16 gap-3"
            >
              <ShoppingCart size={32} className="text-white/10" />
              <p className="text-white/25 text-sm text-center">Tap items from the menu<br />to add them here</p>
            </motion.div>
          ) : (
            cart.map((ci) => (
              <motion.div
                key={ci.menuItem.id}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3 p-2.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <span className="text-lg shrink-0">{ci.menuItem.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/85 leading-tight truncate">{ci.menuItem.name}</p>
                  <p className="text-[11px] text-accent">€{(ci.menuItem.price * ci.quantity).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onRemove(ci.menuItem.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-red-400 transition-colors min-w-[44px] min-h-[44px]"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    <Minus size={12} />
                  </button>
                  <span className="text-white/80 font-bold text-sm w-5 text-center">{ci.quantity}</span>
                  <button
                    onClick={() => onAdd(ci.menuItem)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-accent transition-colors min-w-[44px] min-h-[44px]"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Sticky footer */}
      <div
        className="shrink-0 px-4 py-4 space-y-3"
        style={{
          background: 'rgba(8,20,14,0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {cart.length > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-white/50">
              {cart.reduce((a, c) => a + c.quantity, 0)} item{cart.reduce((a, c) => a + c.quantity, 0) !== 1 ? 's' : ''}
            </span>
            <span className="text-white/80 font-semibold">€{subtotal.toFixed(2)}</span>
          </div>
        )}
        <button
          onClick={onSendToKitchen}
          disabled={cart.length === 0}
          className="w-full h-12 rounded-xl flex items-center justify-center gap-2.5 text-sm font-bold text-[#0A1A14] transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px]"
          style={{
            background: cart.length > 0
              ? 'linear-gradient(135deg, #C8A951, #D4A843)'
              : 'rgba(200,169,81,0.3)',
            boxShadow: cart.length > 0 ? '0 0 20px rgba(200,169,81,0.35)' : 'none',
          }}
        >
          <Send size={16} />
          Send to Kitchen
        </button>
      </div>
    </div>
  );
}

interface OrderBuilderViewProps {
  tableNumber: number;
  cart: CartItem[];
  onAddToCart: (item: MenuItem) => void;
  onRemoveFromCart: (id: string) => void;
  onClearCart: () => void;
  onSendToKitchen: () => void;
}

export function OrderBuilderView({
  tableNumber,
  cart,
  onAddToCart,
  onRemoveFromCart,
  onClearCart,
  onSendToKitchen,
}: OrderBuilderViewProps) {
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered =
    activeCategory === 'All'
      ? MOCK_MENU_ITEMS
      : MOCK_MENU_ITEMS.filter((m) => m.category === activeCategory);

  const cartMap = cart.reduce<Record<string, number>>(
    (acc, ci) => ({ ...acc, [ci.menuItem.id]: ci.quantity }),
    {}
  );

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left: Menu (60%) */}
      <div className="flex flex-col w-[60%] min-w-0">
        {/* Category tabs */}
        <div
          className="flex gap-1.5 px-4 py-2.5 shrink-0 overflow-x-auto"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          {MENU_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
                activeCategory === cat
                  ? 'text-accent'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
              style={
                activeCategory === cat
                  ? {
                      background: 'rgba(200,169,81,0.15)',
                      border: '1px solid rgba(200,169,81,0.3)',
                      boxShadow: '0 0 10px rgba(200,169,81,0.15)',
                    }
                  : { background: 'transparent', border: '1px solid transparent' }
              }
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Menu grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <motion.div layout className="grid grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  cartQty={cartMap[item.id] ?? 0}
                  onAdd={onAddToCart}
                  onRemove={onRemoveFromCart}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* Right: Cart (40%) */}
      <div className="w-[40%] shrink-0 flex flex-col min-h-0">
        <CartPanel
          cart={cart}
          tableNumber={tableNumber}
          onAdd={onAddToCart}
          onRemove={onRemoveFromCart}
          onClear={onClearCart}
          onSendToKitchen={onSendToKitchen}
        />
      </div>
    </div>
  );
}
