"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  Search,
  Plus,
  Minus,
  X,
  Clock,
  Users,
  ChefHat,
  ArrowLeft,
  Send,
  Receipt,
  StickyNote,
  Check,
  Flame,
  CircleDot,
  Filter,
  ShoppingCart,
  Utensils,
  Trash2,
  Bell,
  Eye,
} from "lucide-react";

/* ── Types ── */
interface FloorSection {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

interface TableItem {
  id: number;
  section_id: number;
  table_number: string;
  capacity: number;
  status: string;
  is_active: boolean;
}

interface ActiveOrder {
  id: number;
  table_id: number | null;
  table_number: string | null;
  order_type: string;
  status: string;
  item_count: number;
  total: number;
  created_at: string;
  elapsed_minutes: number;
}

interface MenuCategory {
  id: number;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: number;
  cost: number | null;
  is_available: boolean;
  is_featured: boolean;
  prep_time_min: number;
  allergens_json: { tags?: string[] } | null;
  dietary_tags_json: { tags?: string[] } | null;
  sort_order: number;
}

interface OrderItemType {
  id: number;
  order_id: number;
  menu_item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  modifiers_json: Record<string, unknown> | null;
  status: string;
  notes: string | null;
  sent_to_kitchen_at: string | null;
  served_at: string | null;
}

interface TableOrder {
  id: number;
  table_id: number | null;
  status: string;
  order_type: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  tip_amount: number;
  total: number;
  notes: string | null;
  guest_name: string | null;
}

/* ── Constants ── */
const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  available: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400", label: "Available" },
  occupied: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400", label: "Occupied" },
  reserved: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400", label: "Reserved" },
  cleaning: { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-400", label: "Cleaning" },
  blocked: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400", label: "Blocked" },
};

const ITEM_STATUS: Record<string, { dot: string; text: string; label: string }> = {
  pending: { dot: "bg-gray-400", text: "text-gray-400", label: "Waiting" },
  preparing: { dot: "bg-amber-400 animate-pulse", text: "text-amber-400", label: "Preparing" },
  ready: { dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]", text: "text-emerald-400", label: "Ready" },
  served: { dot: "bg-gray-500", text: "text-gray-500", label: "Served" },
  cancelled: { dot: "bg-red-400", text: "text-red-400", label: "Cancelled" },
};

const DIETARY_BADGES: Record<string, { label: string; color: string }> = {
  vegetarian: { label: "V", color: "bg-green-500/20 text-green-400" },
  vegan: { label: "VG", color: "bg-green-600/20 text-green-300" },
  "gluten-free": { label: "GF", color: "bg-amber-500/20 text-amber-400" },
  halal: { label: "H", color: "bg-teal-500/20 text-teal-400" },
  kosher: { label: "K", color: "bg-indigo-500/20 text-indigo-400" },
};

type Phase = "tables" | "building" | "tracking";

/* ── Notification type ── */
interface ReadyNotification {
  id: string;
  orderId: number;
  tableNumber: string;
  itemName: string;
  allReady: boolean;
  timestamp: number;
}

export default function WaiterStationPage() {
  const router = useRouter();

  // Phase state
  const [phase, setPhase] = useState<Phase>("tables");

  // Table map data
  const [sections, setSections] = useState<FloorSection[]>([]);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [tableSearch, setTableSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState<number | null>(null);

  // Order builder data
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [currentOrder, setCurrentOrder] = useState<TableOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemType[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [itemNoteDrafts, setItemNoteDrafts] = useState<Record<number, string>>({});

  // Loading / action states
  const [loading, setLoading] = useState(true);
  const [sendingToKitchen, setSendingToKitchen] = useState(false);
  const [addingItem, setAddingItem] = useState<number | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<ReadyNotification[]>([]);
  const [previousItemStatuses, setPreviousItemStatuses] = useState<Record<number, Record<number, string>>>({});

  /* ── Data fetching ── */
  const fetchTableData = useCallback(async () => {
    try {
      const [secRes, tabRes, ordRes] = await Promise.all([
        api.get("/reservations/sections"),
        api.get("/reservations/tables"),
        api.get("/billing/orders/live"),
      ]);
      setSections(secRes.data);
      setTables(tabRes.data);
      setActiveOrders(ordRes.data);
    } catch {
      /* silently handle */
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOrderDetails = useCallback(async (orderId: number) => {
    try {
      const [orderRes, itemsRes] = await Promise.all([
        api.get(`/billing/orders/${orderId}`),
        api.get(`/billing/orders/${orderId}/items`),
      ]);
      setCurrentOrder(orderRes.data);
      const newItems: OrderItemType[] = itemsRes.data;
      setOrderItems(newItems);
      return newItems;
    } catch {
      return null;
    }
  }, []);

  const fetchMenu = useCallback(async () => {
    try {
      const [catRes, itemRes] = await Promise.all([
        api.get("/menu/categories"),
        api.get("/menu/items"),
      ]);
      setCategories(catRes.data);
      setMenuItems(itemRes.data);
    } catch {
      /* silently handle */
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchTableData();
    fetchMenu();
  }, [fetchTableData, fetchMenu]);

  // Polling for active orders (every 5s) — detect ready items
  useEffect(() => {
    const interval = setInterval(async () => {
      await fetchTableData();

      // If we have a current order in tracking/building phase, refresh its items
      if (currentOrder && (phase === "tracking" || phase === "building")) {
        const newItems = await fetchOrderDetails(currentOrder.id);
        if (newItems) {
          // Check for newly ready items
          const prevStatuses = previousItemStatuses[currentOrder.id] || {};
          const newNotifs: ReadyNotification[] = [];
          for (const item of newItems) {
            if (item.status === "ready" && prevStatuses[item.id] !== "ready") {
              newNotifs.push({
                id: `${item.id}-${Date.now()}`,
                orderId: currentOrder.id,
                tableNumber: selectedTable?.table_number || "?",
                itemName: item.item_name,
                allReady: false,
                timestamp: Date.now(),
              });
            }
          }
          // Check if all items are ready
          if (newItems.length > 0 && newItems.every(i => i.status === "ready" || i.status === "served")) {
            const wasAllReady = Object.values(prevStatuses).every(s => s === "ready" || s === "served");
            if (!wasAllReady && newItems.some(i => i.status === "ready")) {
              newNotifs.push({
                id: `all-${currentOrder.id}-${Date.now()}`,
                orderId: currentOrder.id,
                tableNumber: selectedTable?.table_number || "?",
                itemName: "ALL items",
                allReady: true,
                timestamp: Date.now(),
              });
            }
          }
          if (newNotifs.length > 0) {
            setNotifications(prev => [...newNotifs, ...prev].slice(0, 10));
          }
          // Save current statuses
          const statusMap: Record<number, string> = {};
          for (const item of newItems) statusMap[item.id] = item.status;
          setPreviousItemStatuses(prev => ({ ...prev, [currentOrder.id]: statusMap }));
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentOrder, phase, selectedTable, previousItemStatuses, fetchTableData, fetchOrderDetails]);

  // Also check active orders for ready notifications on table map phase
  useEffect(() => {
    if (phase !== "tables") return;
    const checkNotifs = async () => {
      for (const order of activeOrders) {
        try {
          const res = await api.get(`/billing/orders/${order.id}/items`);
          const items: OrderItemType[] = res.data;
          const prevStatuses = previousItemStatuses[order.id] || {};
          const newNotifs: ReadyNotification[] = [];
          for (const item of items) {
            if (item.status === "ready" && prevStatuses[item.id] !== "ready") {
              newNotifs.push({
                id: `${item.id}-${Date.now()}`,
                orderId: order.id,
                tableNumber: order.table_number || "?",
                itemName: item.item_name,
                allReady: false,
                timestamp: Date.now(),
              });
            }
          }
          if (items.length > 0 && items.every(i => i.status === "ready" || i.status === "served")) {
            const wasAllReady = Object.values(prevStatuses).length > 0 &&
              Object.values(prevStatuses).every(s => s === "ready" || s === "served");
            if (!wasAllReady && items.some(i => i.status === "ready")) {
              newNotifs.push({
                id: `all-${order.id}-${Date.now()}`,
                orderId: order.id,
                tableNumber: order.table_number || "?",
                itemName: "ALL items",
                allReady: true,
                timestamp: Date.now(),
              });
            }
          }
          if (newNotifs.length > 0) {
            setNotifications(prev => [...newNotifs, ...prev].slice(0, 10));
          }
          const statusMap: Record<number, string> = {};
          for (const item of items) statusMap[item.id] = item.status;
          setPreviousItemStatuses(prev => ({ ...prev, [order.id]: statusMap }));
        } catch {
          /* skip */
        }
      }
    };
    if (activeOrders.length > 0) checkNotifs();
  }, [activeOrders, phase, previousItemStatuses]);

  // Auto-dismiss notifications after 15s
  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications(prev => prev.filter(n => Date.now() - n.timestamp < 15000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  /* ── Actions ── */
  const handleTableClick = async (table: TableItem) => {
    if (table.status === "cleaning" || table.status === "blocked" || table.status === "reserved") return;

    setSelectedTable(table);

    // Check if table has existing order
    const existingOrder = activeOrders.find(o => o.table_number === table.table_number);
    if (existingOrder) {
      await fetchOrderDetails(existingOrder.id);
      setPhase("building");
      return;
    }

    // Create new order for this table
    try {
      const res = await api.post("/billing/orders", {
        table_id: table.id,
        order_type: "dine_in",
      });
      setCurrentOrder(res.data);
      setOrderItems([]);
      setPhase("building");
    } catch {
      /* handle */
    }
  };

  const handleAddItem = async (menuItem: MenuItem) => {
    if (!currentOrder || !menuItem.is_available) return;
    setAddingItem(menuItem.id);

    // Check if item already in order
    const existing = orderItems.find(oi => oi.menu_item_id === menuItem.id);
    if (existing) {
      try {
        await api.put(`/billing/items/${existing.id}`, { quantity: existing.quantity + 1 });
        await fetchOrderDetails(currentOrder.id);
      } catch { /* handle */ }
    } else {
      try {
        await api.post(`/billing/orders/${currentOrder.id}/items`, {
          menu_item_id: menuItem.id,
          item_name: menuItem.name,
          unit_price: menuItem.price,
          quantity: 1,
        });
        await fetchOrderDetails(currentOrder.id);
      } catch { /* handle */ }
    }
    setAddingItem(null);
  };

  const handleUpdateQuantity = async (item: OrderItemType, delta: number) => {
    if (!currentOrder) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      try {
        await api.delete(`/billing/items/${item.id}`);
        await fetchOrderDetails(currentOrder.id);
      } catch { /* handle */ }
    } else {
      try {
        await api.put(`/billing/items/${item.id}`, { quantity: newQty });
        await fetchOrderDetails(currentOrder.id);
      } catch { /* handle */ }
    }
  };

  const handleRemoveItem = async (itemId: number) => {
    if (!currentOrder) return;
    try {
      await api.delete(`/billing/items/${itemId}`);
      await fetchOrderDetails(currentOrder.id);
    } catch { /* handle */ }
  };

  const handleSaveNote = async (item: OrderItemType) => {
    const note = itemNoteDrafts[item.id];
    if (note === undefined) return;
    try {
      await api.put(`/billing/items/${item.id}`, { notes: note || null });
      await fetchOrderDetails(currentOrder!.id);
      setExpandedNotes(prev => { const s = new Set(prev); s.delete(item.id); return s; });
    } catch { /* handle */ }
  };

  const handleSendToKitchen = async () => {
    if (!currentOrder) return;
    setSendingToKitchen(true);
    try {
      await api.post(`/billing/orders/${currentOrder.id}/send-to-kitchen`);
      await fetchOrderDetails(currentOrder.id);
      setPhase("tracking");
    } catch { /* handle */ }
    setSendingToKitchen(false);
  };

  const handleMarkServed = async (itemId: number) => {
    try {
      await api.post(`/billing/kds/items/${itemId}/served`);
      if (currentOrder) await fetchOrderDetails(currentOrder.id);
    } catch { /* handle */ }
  };

  const handleGoToCheckout = () => {
    if (!currentOrder) return;
    router.push(`/orders/${currentOrder.id}/checkout`);
  };

  const handleBackToTables = () => {
    setPhase("tables");
    setSelectedTable(null);
    setCurrentOrder(null);
    setOrderItems([]);
    setMenuSearch("");
    setSelectedCategory(null);
    fetchTableData();
  };

  const handleViewOrder = async (order: ActiveOrder) => {
    const table = tables.find(t => t.table_number === order.table_number);
    setSelectedTable(table || null);
    await fetchOrderDetails(order.id);
    const items = orderItems;
    const hasSentItems = items.some(i => i.status !== "pending");
    setPhase(hasSentItems ? "tracking" : "building");
  };

  /* ── Computed ── */
  const filteredTables = useMemo(() => {
    let filtered = tables.filter(t => t.is_active);
    if (tableSearch) {
      filtered = filtered.filter(t =>
        t.table_number.toLowerCase().includes(tableSearch.toLowerCase())
      );
    }
    if (sectionFilter !== null) {
      filtered = filtered.filter(t => t.section_id === sectionFilter);
    }
    return filtered;
  }, [tables, tableSearch, sectionFilter]);

  const filteredMenuItems = useMemo(() => {
    let filtered = menuItems;
    if (selectedCategory !== null) {
      filtered = filtered.filter(m => m.category_id === selectedCategory);
    }
    if (menuSearch) {
      const q = menuSearch.toLowerCase();
      filtered = filtered.filter(m => m.name.toLowerCase().includes(q));
    }
    return filtered.sort((a, b) => a.sort_order - b.sort_order);
  }, [menuItems, selectedCategory, menuSearch]);

  const sectionMap = useMemo(() => {
    const map: Record<number, FloorSection> = {};
    for (const s of sections) map[s.id] = s;
    return map;
  }, [sections]);

  const tablesBySection = useMemo(() => {
    const map: Record<number, TableItem[]> = {};
    for (const t of filteredTables) {
      if (!map[t.section_id]) map[t.section_id] = [];
      map[t.section_id].push(t);
    }
    return map;
  }, [filteredTables]);

  const orderForTable = useCallback((tableNumber: string) => {
    return activeOrders.find(o => o.table_number === tableNumber);
  }, [activeOrders]);

  const floorSummary = useMemo(() => {
    const active = tables.filter(t => t.is_active);
    return {
      available: active.filter(t => t.status === "available").length,
      occupied: active.filter(t => t.status === "occupied").length,
      reserved: active.filter(t => t.status === "reserved").length,
      other: active.filter(t => !["available", "occupied", "reserved"].includes(t.status)).length,
      total: active.length,
    };
  }, [tables]);

  const pendingItemsCount = orderItems.filter(i => i.status === "pending").length;
  const readyItemsCount = orderItems.filter(i => i.status === "ready").length;
  const allItemsReady = orderItems.length > 0 && orderItems.every(i => i.status === "ready" || i.status === "served");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     PHASE A: TABLE MAP
     ═══════════════════════════════════════════════════════════════ */
  if (phase === "tables") {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Utensils className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Waiter Station</h1>
              <p className="text-xs text-muted-foreground">Select a table to start ordering</p>
            </div>
          </div>
        </div>

        {/* Floor summary */}
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-muted-foreground">{floorSummary.available} Available</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            <span className="text-muted-foreground">{floorSummary.occupied} Occupied</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-muted-foreground">{floorSummary.reserved} Reserved</span>
          </span>
          {floorSummary.other > 0 && (
            <span className="text-muted-foreground">{floorSummary.other} Other</span>
          )}
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search table..."
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>
          <select
            value={sectionFilter ?? ""}
            onChange={e => setSectionFilter(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          >
            <option value="">All Sections</option>
            {sections.filter(s => s.is_active).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Table sections */}
        <div className="space-y-5">
          {sections
            .filter(s => s.is_active && tablesBySection[s.id]?.length)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(section => (
              <div key={section.id}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {section.name}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {tablesBySection[section.id]?.map(table => {
                    const config = STATUS_CONFIG[table.status] || STATUS_CONFIG.available;
                    const order = orderForTable(table.table_number);
                    const isClickable = table.status === "available" || table.status === "occupied";

                    return (
                      <button
                        key={table.id}
                        onClick={() => handleTableClick(table)}
                        disabled={!isClickable}
                        className={`relative p-4 rounded-2xl border transition-all duration-200 text-left
                          ${config.bg} border-border/50
                          ${isClickable
                            ? "hover:scale-[1.02] hover:shadow-lg hover:border-orange-500/30 cursor-pointer active:scale-[0.98]"
                            : "opacity-60 cursor-not-allowed"
                          }
                          ${order && activeOrders.find(o => o.id === order.id && o.item_count > 0)
                            ? "ring-1 ring-blue-500/30"
                            : ""
                          }
                        `}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-lg font-bold text-foreground">T{table.table_number}</span>
                          <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <Users className="h-3 w-3" />
                          <span>{table.capacity}</span>
                        </div>
                        <span className={`text-xs font-medium ${config.text}`}>
                          {config.label}
                        </span>
                        {order && (
                          <div className="mt-2 pt-2 border-t border-border/30 text-xs">
                            <span className="text-muted-foreground">{order.item_count} items</span>
                            <span className="float-right font-mono font-semibold text-foreground">
                              &euro;{order.total.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>

        {/* Active Orders */}
        {activeOrders.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Active Orders ({activeOrders.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeOrders.map(order => {
                const isReady = order.status === "served" || false;
                return (
                  <button
                    key={order.id}
                    onClick={() => handleViewOrder(order)}
                    className={`p-4 rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm text-left
                      transition-all duration-200 hover:shadow-lg hover:border-orange-500/30 active:scale-[0.98]
                      ${isReady ? "ring-1 ring-emerald-500/40 bg-emerald-500/5" : ""}
                    `}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-foreground">Order #{order.id}</span>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{order.elapsed_minutes}min</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {order.table_number ? `T${order.table_number}` : "No table"} &middot; {order.item_count} items
                      </span>
                      <span className="font-mono font-semibold text-foreground">
                        &euro;{order.total.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-2">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
                        ${order.status === "open" ? "bg-blue-500/10 text-blue-400" :
                          order.status === "submitted" || order.status === "preparing" ? "bg-amber-500/10 text-amber-400" :
                          order.status === "served" ? "bg-emerald-500/10 text-emerald-400" :
                          "bg-gray-500/10 text-gray-400"
                        }`}>
                        <CircleDot className="h-3 w-3" />
                        {order.status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Notification bar */}
        {notifications.length > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
            <div className={`rounded-2xl border p-4 backdrop-blur-xl shadow-2xl
              ${notifications[0].allReady
                ? "bg-emerald-500/15 border-emerald-500/40"
                : "bg-emerald-500/10 border-emerald-500/30"
              } animate-pulse`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-300">
                    Table T{notifications[0].tableNumber} &mdash; {notifications[0].itemName}
                    {notifications[0].allReady ? " are READY!" : " is READY!"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const order = activeOrders.find(o => o.id === notifications[0].orderId);
                    if (order) handleViewOrder(order);
                  }}
                  className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition-colors"
                >
                  Go
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     PHASE B & C: ORDER BUILDER / TRACKING
     ═══════════════════════════════════════════════════════════════ */
  const isTracking = phase === "tracking" || orderItems.some(i => i.status !== "pending");

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-1 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToTables}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">
                Table T{selectedTable?.table_number}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> {selectedTable?.capacity} seats
              </span>
            </div>
            {currentOrder && (
              <span className="text-xs text-muted-foreground">
                Order #{currentOrder.id} &middot;
                <span className={`ml-1 ${
                  currentOrder.status === "open" ? "text-blue-400" :
                  currentOrder.status === "submitted" || currentOrder.status === "preparing" ? "text-amber-400" :
                  "text-emerald-400"
                }`}>
                  {currentOrder.status}
                </span>
              </span>
            )}
          </div>
        </div>
        {allItemsReady && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl animate-pulse">
            <Check className="h-4 w-4" /> All Ready
          </span>
        )}
      </div>

      {/* Split panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT — Menu Browser */}
        <div className="w-3/5 border-r border-border/50 flex flex-col overflow-hidden">
          {/* Menu search */}
          <div className="p-3 border-b border-border/30">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search menu..."
                value={menuSearch}
                onChange={e => setMenuSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-border/30 flex-shrink-0">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${selectedCategory === null
                  ? "bg-orange-500 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
            >
              All
            </button>
            {categories.filter(c => c.is_active).sort((a, b) => a.sort_order - b.sort_order).map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${selectedCategory === cat.id
                    ? "bg-orange-500 text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Menu grid */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5">
              {filteredMenuItems.map(item => {
                const inOrder = orderItems.find(oi => oi.menu_item_id === item.id);
                const dietTags = item.dietary_tags_json?.tags || [];

                return (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    disabled={!item.is_available || addingItem === item.id}
                    className={`relative p-3 rounded-xl border text-left transition-all duration-200
                      ${item.is_available
                        ? "border-border/50 bg-card/80 hover:border-orange-500/40 hover:shadow-md active:scale-[0.97]"
                        : "border-border/30 bg-muted/30 opacity-50 cursor-not-allowed"
                      }
                      ${inOrder ? "ring-1 ring-orange-500/30" : ""}
                    `}
                  >
                    {inOrder && (
                      <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center font-bold shadow-lg">
                        {inOrder.quantity}
                      </span>
                    )}
                    <div className="font-medium text-sm text-foreground leading-tight mb-1 pr-4">
                      {item.name}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold text-orange-500">
                        &euro;{item.price.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-3 w-3" /> {item.prep_time_min}m
                      </span>
                    </div>
                    {dietTags.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {dietTags.map(tag => {
                          const badge = DIETARY_BADGES[tag.toLowerCase()];
                          if (!badge) return null;
                          return (
                            <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${badge.color}`}>
                              {badge.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {!item.is_available && (
                      <div className="absolute inset-0 rounded-xl bg-background/60 flex items-center justify-center">
                        <span className="text-xs font-medium text-muted-foreground">Unavailable</span>
                      </div>
                    )}
                    {addingItem === item.id && (
                      <div className="absolute inset-0 rounded-xl bg-orange-500/10 flex items-center justify-center">
                        <div className="h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {filteredMenuItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Search className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No items found</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Current Order */}
        <div className="w-2/5 flex flex-col bg-card/50">
          {/* Order header */}
          <div className="p-3 border-b border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-orange-500" />
                <span className="font-semibold text-sm">
                  {orderItems.length} item{orderItems.length !== 1 ? "s" : ""}
                </span>
              </div>
              {readyItemsCount > 0 && (
                <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-lg">
                  {readyItemsCount}/{orderItems.length} ready
                </span>
              )}
            </div>
          </div>

          {/* Items list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {orderItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Utensils className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Tap items to add</p>
              </div>
            ) : (
              orderItems.map(item => {
                const status = ITEM_STATUS[item.status] || ITEM_STATUS.pending;
                const isReady = item.status === "ready";
                const isServed = item.status === "served";

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3 transition-all duration-300
                      ${isReady ? "bg-emerald-500/5 border-emerald-500/30" :
                        isServed ? "bg-muted/30 border-border/30 opacity-60" :
                        "bg-card border-border/50"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${status.dot}`} />
                          <span className={`text-sm font-medium truncate ${isServed ? "line-through text-muted-foreground" : ""}`}>
                            {item.item_name}
                          </span>
                        </div>
                        {isTracking && (
                          <span className={`text-xs ml-4 ${status.text}`}>{status.label}</span>
                        )}
                        {item.notes && (
                          <p className="text-xs text-amber-400 italic ml-4 mt-0.5">{item.notes}</p>
                        )}
                      </div>
                      <span className="font-mono text-sm font-semibold text-foreground flex-shrink-0">
                        &euro;{item.total_price.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      {/* Quantity controls */}
                      {item.status === "pending" ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleUpdateQuantity(item, -1)}
                            className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => handleUpdateQuantity(item, 1)}
                            className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>

                          {/* Notes toggle */}
                          <button
                            onClick={() => {
                              setExpandedNotes(prev => {
                                const s = new Set(prev);
                                if (s.has(item.id)) s.delete(item.id);
                                else { s.add(item.id); setItemNoteDrafts(d => ({ ...d, [item.id]: item.notes || "" })); }
                                return s;
                              });
                            }}
                            className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ml-1
                              ${item.notes ? "bg-amber-500/10 text-amber-400" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                          >
                            <StickyNote className="h-3 w-3" />
                          </button>

                          {/* Remove */}
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="h-7 w-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors ml-1"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{item.quantity}×</span>
                      )}

                      {/* Mark served button (for ready items) */}
                      {isReady && (
                        <button
                          onClick={() => handleMarkServed(item.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors"
                        >
                          <Check className="h-3 w-3" /> Served
                        </button>
                      )}
                    </div>

                    {/* Expanded notes input */}
                    {expandedNotes.has(item.id) && item.status === "pending" && (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          placeholder="Add note (e.g. no onion, extra spicy)..."
                          value={itemNoteDrafts[item.id] ?? ""}
                          onChange={e => setItemNoteDrafts(d => ({ ...d, [item.id]: e.target.value }))}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                        />
                        <button
                          onClick={() => handleSaveNote(item)}
                          className="px-2 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-medium hover:bg-orange-500/20 transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Totals & Actions */}
          {currentOrder && (
            <div className="border-t border-border/50 p-3 space-y-3">
              {/* Totals */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">&euro;{currentOrder.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="font-mono">&euro;{currentOrder.tax_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-foreground text-base">
                  <span>Total</span>
                  <span className="font-mono">&euro;{currentOrder.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                {pendingItemsCount > 0 && (
                  <button
                    onClick={handleSendToKitchen}
                    disabled={sendingToKitchen || pendingItemsCount === 0}
                    className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm
                      hover:bg-orange-600 active:scale-[0.98] transition-all duration-200
                      disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center justify-center gap-2"
                  >
                    <Flame className="h-4 w-4" />
                    {sendingToKitchen ? "Sending..." : `Send to Kitchen (${pendingItemsCount})`}
                  </button>
                )}

                {orderItems.length > 0 && (
                  <button
                    onClick={handleGoToCheckout}
                    className="w-full py-3 rounded-xl border border-border bg-card text-foreground font-semibold text-sm
                      hover:bg-muted active:scale-[0.98] transition-all duration-200
                      flex items-center justify-center gap-2"
                  >
                    <Receipt className="h-4 w-4" />
                    Generate Bill
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notification bar (floating) */}
      {notifications.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
          <div className={`rounded-2xl border p-4 backdrop-blur-xl shadow-2xl
            ${notifications[0].allReady
              ? "bg-emerald-500/15 border-emerald-500/40"
              : "bg-emerald-500/10 border-emerald-500/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-300">
                  Table T{notifications[0].tableNumber} &mdash; {notifications[0].itemName}
                  {notifications[0].allReady ? " are READY!" : " is READY!"}
                </span>
              </div>
              <button
                onClick={() => setNotifications(prev => prev.slice(1))}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="h-3 w-3 text-emerald-400" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
