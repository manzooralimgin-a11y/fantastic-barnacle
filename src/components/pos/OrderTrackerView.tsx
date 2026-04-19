'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChefHat, CreditCard, Clock } from 'lucide-react';
import type { OrderItem, OrderItemStatus } from './types';
import { MOCK_ACTIVE_ORDER } from './mockData';

const STATUS_CONFIG: Record<
  OrderItemStatus,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  preparing: {
    label: 'Preparing',
    icon: ChefHat,
    color: 'text-white/35',
    bg: 'bg-white/5',
  },
  ready: {
    label: 'Ready',
    icon: ChefHat,
    color: 'text-amber-400',
    bg: 'bg-amber-500/15',
  },
  served: {
    label: 'Served',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
};

interface OrderItemRowProps {
  item: OrderItem;
  onMarkServed: (id: string) => void;
}

function OrderItemRow({ item, onMarkServed }: OrderItemRowProps) {
  const cfg = STATUS_CONFIG[item.status];
  const Icon = cfg.icon;
  const isReady = item.status === 'ready';
  const isServed = item.status === 'served';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isServed ? 0.45 : 1, y: 0 }}
      className={`flex items-center gap-4 p-4 rounded-xl transition-all ${cfg.bg}`}
      style={{ border: isReady ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Emoji */}
      <span className={`text-2xl shrink-0 ${isServed ? 'grayscale opacity-50' : ''}`}>
        {item.menuItem.emoji}
      </span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-tight ${isServed ? 'text-white/30 line-through' : 'text-white/85'}`}>
          {item.menuItem.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-white/30">×{item.quantity}</span>
          <span className="text-[11px] text-white/25">•</span>
          <span className="text-[11px] text-white/40">€{(item.menuItem.price * item.quantity).toFixed(2)}</span>
        </div>
      </div>

      {/* Status badge + action */}
      <div className="flex items-center gap-3 shrink-0">
        {isReady ? (
          <motion.div
            animate={{ boxShadow: ['0 0 8px rgba(245,158,11,0.3)', '0 0 18px rgba(245,158,11,0.6)', '0 0 8px rgba(245,158,11,0.3)'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)' }}
          >
            <Icon size={13} className={cfg.color} />
            <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
          </motion.div>
        ) : (
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${cfg.bg}`} style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            {isServed ? (
              <Icon size={13} className={cfg.color} />
            ) : (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
              >
                <Clock size={13} className="text-white/30" />
              </motion.div>
            )}
            <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          </div>
        )}

        {isReady && (
          <button
            onClick={() => onMarkServed(item.id)}
            className="h-9 px-4 rounded-lg text-xs font-bold text-[#0A1A14] transition-all active:scale-95 min-h-[44px]"
            style={{
              background: 'linear-gradient(135deg, #C8A951, #D4A843)',
              boxShadow: '0 0 14px rgba(200,169,81,0.4)',
            }}
          >
            Served
          </button>
        )}
      </div>
    </motion.div>
  );
}

interface OrderTrackerViewProps {
  tableNumber: number;
  onCheckout: () => void;
}

export function OrderTrackerView({ tableNumber, onCheckout }: OrderTrackerViewProps) {
  const [items, setItems] = useState<OrderItem[]>(MOCK_ACTIVE_ORDER);

  const handleMarkServed = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'served' as OrderItemStatus } : item))
    );
  };

  const allServed = items.every((i) => i.status === 'served');
  const total = items.reduce((acc, i) => acc + i.menuItem.price * i.quantity, 0);
  const readyCount = items.filter((i) => i.status === 'ready').length;
  const preparingCount = items.filter((i) => i.status === 'preparing').length;
  const servedCount = items.filter((i) => i.status === 'served').length;

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4">
      {/* Progress summary */}
      <div
        className="flex items-center gap-6 px-5 py-3 rounded-xl shrink-0"
        style={{
          background: 'rgba(10,26,20,0.55)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-white/30" />
          <span className="text-xs text-white/50 font-medium">Preparing:</span>
          <span className="text-sm font-bold text-white/70">{preparingCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <ChefHat size={14} className="text-amber-400" />
          <span className="text-xs text-white/50 font-medium">Ready:</span>
          <span className="text-sm font-bold text-amber-400">{readyCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-400" />
          <span className="text-xs text-white/50 font-medium">Served:</span>
          <span className="text-sm font-bold text-emerald-400">{servedCount}</span>
        </div>

        {/* Progress bar */}
        <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #10B981, #C8A951)' }}
            animate={{ width: `${(servedCount / items.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
        <span className="text-xs text-white/40 font-medium shrink-0">
          {servedCount}/{items.length}
        </span>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        <AnimatePresence>
          {items.map((item) => (
            <OrderItemRow key={item.id} item={item} onMarkServed={handleMarkServed} />
          ))}
        </AnimatePresence>
      </div>

      {/* Checkout footer */}
      <AnimatePresence>
        {allServed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="shrink-0 flex items-center justify-between px-5 py-4 rounded-2xl"
            style={{
              background: 'rgba(8,20,14,0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(200,169,81,0.25)',
              boxShadow: '0 0 24px rgba(200,169,81,0.12)',
            }}
          >
            <div>
              <p className="text-xs text-white/40 font-medium">Table {tableNumber} — All served</p>
              <p className="text-xl font-bold text-white/90 mt-0.5">€{total.toFixed(2)}</p>
            </div>
            <button
              onClick={onCheckout}
              className="h-12 px-8 rounded-xl flex items-center gap-2.5 text-sm font-bold text-[#0A1A14] min-h-[44px]"
              style={{
                background: 'linear-gradient(135deg, #C8A951, #D4A843)',
                boxShadow: '0 0 24px rgba(200,169,81,0.45)',
              }}
            >
              <CreditCard size={17} />
              Checkout
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global checkout (partially served) */}
      {!allServed && servedCount > 0 && (
        <div className="shrink-0 flex justify-end">
          <button
            onClick={onCheckout}
            className="h-10 px-6 rounded-xl flex items-center gap-2 text-xs font-semibold text-accent border border-accent/30 bg-accent/10 transition-all hover:bg-accent/20 min-h-[44px]"
          >
            <CreditCard size={14} />
            Checkout anyway — €{total.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
}
