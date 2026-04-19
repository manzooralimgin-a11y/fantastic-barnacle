'use client';

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CartItem, MenuItem, POSPhase, Table } from './types';
import { POSSidebar } from './POSSidebar';
import { POSHeader } from './POSHeader';
import { TableMapView } from './TableMapView';
import { OrderBuilderView } from './OrderBuilderView';
import { OrderTrackerView } from './OrderTrackerView';

const PHASE_VARIANTS = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export function POSApp() {
  const [phase, setPhase] = useState<POSPhase>('table-map');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const handleSelectTable = useCallback((table: Table) => {
    setSelectedTable(table);
    if (table.status === 'occupied' && table.orderId) {
      setPhase('order-tracker');
    } else {
      setCart([]);
      setPhase('order-builder');
    }
  }, []);

  const handleAddToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.menuItem.id === item.id);
      if (existing) {
        return prev.map((ci) =>
          ci.menuItem.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  }, []);

  const handleRemoveFromCart = useCallback((id: string) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.menuItem.id === id);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter((ci) => ci.menuItem.id !== id);
      return prev.map((ci) =>
        ci.menuItem.id === id ? { ...ci, quantity: ci.quantity - 1 } : ci
      );
    });
  }, []);

  const handleSendToKitchen = useCallback(() => {
    setPhase('order-tracker');
  }, []);

  const handleBackToMap = useCallback(() => {
    setPhase('table-map');
    setSelectedTable(null);
  }, []);

  const handleCheckout = useCallback(() => {
    // TODO: integrate checkout flow
    alert(`Checkout for Table ${selectedTable?.number} — €TODO`);
  }, [selectedTable]);

  return (
    <div
      className="flex w-full h-full overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #060f0a 0%, #0A1A14 40%, #0d2018 100%)' }}
    >
      <POSSidebar />

      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <POSHeader
          phase={phase}
          selectedTable={selectedTable}
          unreadCount={3}
          onBackToMap={handleBackToMap}
        />

        <main className="flex flex-col flex-1 min-h-0 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {phase === 'table-map' && (
              <motion.div
                key="table-map"
                className="flex flex-col flex-1 min-h-0"
                {...PHASE_VARIANTS}
                transition={{ duration: 0.2 }}
              >
                <TableMapView onSelectTable={handleSelectTable} />
              </motion.div>
            )}

            {phase === 'order-builder' && (
              <motion.div
                key="order-builder"
                className="flex flex-col flex-1 min-h-0"
                {...PHASE_VARIANTS}
                transition={{ duration: 0.2 }}
              >
                <OrderBuilderView
                  tableNumber={selectedTable?.number ?? 0}
                  cart={cart}
                  onAddToCart={handleAddToCart}
                  onRemoveFromCart={handleRemoveFromCart}
                  onClearCart={() => setCart([])}
                  onSendToKitchen={handleSendToKitchen}
                />
              </motion.div>
            )}

            {phase === 'order-tracker' && (
              <motion.div
                key="order-tracker"
                className="flex flex-col flex-1 min-h-0"
                {...PHASE_VARIANTS}
                transition={{ duration: 0.2 }}
              >
                <OrderTrackerView
                  tableNumber={selectedTable?.number ?? 0}
                  onCheckout={handleCheckout}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
