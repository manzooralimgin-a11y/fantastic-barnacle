export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'blocked';
export type TableShape = 'round' | 'square';

export interface Table {
  id: string;
  number: number;
  shape: TableShape;
  status: TableStatus;
  seats: number;
  x: number; // percent of container width
  y: number; // percent of container height
  elapsed_minutes: number;
  ready_item_count: number;
  orderId?: string;
  label?: string;
}

export type DietaryBadge = 'V' | 'VG' | 'GF';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  dietary: DietaryBadge[];
  available: boolean;
  emoji: string;
}

export type OrderItemStatus = 'preparing' | 'ready' | 'served';

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes?: string;
}

export interface OrderItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  status: OrderItemStatus;
}

export type POSPhase = 'table-map' | 'order-builder' | 'order-tracker';

export const TABLE_STATUS_CONFIG: Record<
  TableStatus,
  { label: string; color: string; bg: string; glow: string; ring: string }
> = {
  available: {
    label: 'Available',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
    glow: 'shadow-[0_0_12px_3px_rgba(16,185,129,0.35)]',
    ring: 'ring-emerald-500/60',
  },
  occupied: {
    label: 'Occupied',
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    glow: 'shadow-[0_0_12px_3px_rgba(59,130,246,0.35)]',
    ring: 'ring-blue-500/60',
  },
  reserved: {
    label: 'Reserved',
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
    glow: 'shadow-[0_0_12px_3px_rgba(245,158,11,0.35)]',
    ring: 'ring-amber-500/60',
  },
  cleaning: {
    label: 'Cleaning',
    color: 'text-violet-400',
    bg: 'bg-violet-500/20',
    glow: 'shadow-[0_0_12px_3px_rgba(139,92,246,0.35)]',
    ring: 'ring-violet-500/60',
  },
  blocked: {
    label: 'Blocked',
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    glow: 'shadow-[0_0_12px_3px_rgba(239,68,68,0.35)]',
    ring: 'ring-red-500/60',
  },
};
