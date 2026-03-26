"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  ChefHat,
  Clock,
  Check,
  RefreshCw,
  Flame,
  Undo2,
  AlertTriangle,
} from "lucide-react";

/* ── Types ── */
interface KDSItem {
  id: number;
  menu_item_id?: number;
  item_name: string;
  quantity: number;
  notes: string | null;
  status: string;
  station: string | null;
  course_number: number;
  modifiers_json?: Record<string, unknown> | null;
}

interface KDSOrder {
  order_id: number;
  table_id: number;
  table_number: string;
  order_type: string;
  guest_name: string | null;
  status: string;
  created_at: string | null;
  elapsed_minutes: number;
  elapsed_seconds: number; // computed locally
  items: KDSItem[];
}

interface KDSStation {
  id: number;
  name: string;
  display_name: string;
  color: string;
  is_active: boolean;
}

/* ── Helpers ── */
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getTimerColor(seconds: number): string {
  if (seconds < 300) return "text-emerald-400";
  if (seconds < 600) return "text-amber-400";
  return "text-red-400";
}

function getCardStyle(seconds: number): string {
  if (seconds < 300) return "border-emerald-500/30 bg-emerald-500/5";
  if (seconds < 600) return "border-amber-500/30 bg-amber-500/5";
  return "border-red-500/30 bg-red-500/5";
}

function getUrgencyGlow(seconds: number): string {
  if (seconds < 300) return "";
  if (seconds < 600) return "shadow-amber-500/10 shadow-lg";
  return "shadow-red-500/20 shadow-xl animate-pulse";
}

export default function KitchenBoardPage() {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [stations, setStations] = useState<KDSStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [actionInProgress, setActionInProgress] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const stationParam = selectedStation ? `?station=${selectedStation}` : "";
      const [ordersRes, stationsRes] = await Promise.all([
        api.get(`/billing/kds/orders${stationParam}`),
        api.get("/billing/kds/stations"),
      ]);
      // Compute elapsed_seconds from elapsed_minutes (API returns minutes)
      const ordersWithSeconds = (ordersRes.data || []).map((o: KDSOrder) => ({
        ...o,
        elapsed_seconds: o.elapsed_seconds || (o.elapsed_minutes || 0) * 60,
      }));
      setOrders(ordersWithSeconds);
      setStations(stationsRes.data);
      setLastRefresh(new Date());
    } catch {
      /* silently handle */
    } finally {
      setLoading(false);
    }
  }, [selectedStation]);

  // Auto-refresh every 5s
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Timer tick — update elapsed seconds locally
  useEffect(() => {
    const tick = setInterval(() => {
      setOrders(prev =>
        prev.map(o => ({ ...o, elapsed_seconds: o.elapsed_seconds + 1 }))
      );
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const markItemReady = async (itemId: number) => {
    setActionInProgress(prev => new Set(prev).add(itemId));
    try {
      await api.post(`/billing/kds/items/${itemId}/ready`);
      await fetchData();
    } catch { /* handle */ }
    setActionInProgress(prev => { const s = new Set(prev); s.delete(itemId); return s; });
  };

  const recallItem = async (itemId: number) => {
    setActionInProgress(prev => new Set(prev).add(itemId));
    try {
      await api.post(`/billing/kds/items/${itemId}/recall`);
      await fetchData();
    } catch { /* handle */ }
    setActionInProgress(prev => { const s = new Set(prev); s.delete(itemId); return s; });
  };

  const bumpOrder = async (orderId: number) => {
    try {
      await api.post(`/billing/kds/orders/${orderId}/bump`);
      await fetchData();
    } catch { /* handle */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const activeStations = stations.filter(s => s.is_active);
  const activeOrders = orders.filter(o =>
    o.items.some(i => i.status === "pending" || i.status === "preparing" || i.status === "ready")
  );

  return (
    <div className="space-y-4 px-4 pt-4 pb-8 min-h-screen bg-gray-950 text-white rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Flame className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Kitchen Board</h1>
            <p className="text-xs text-muted-foreground">
              {activeOrders.length} active order{activeOrders.length !== 1 ? "s" : ""} &middot;
              Updated {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-muted-foreground/60 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Station Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedStation(null)}
          className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
            ${selectedStation === null
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
              : "bg-gray-800 text-muted-foreground/60 hover:text-white hover:bg-gray-700"
            }`}
        >
          All Stations
        </button>
        {activeStations.map(s => (
          <button
            key={s.id}
            onClick={() => setSelectedStation(s.name)}
            className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
              ${selectedStation === s.name
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                : "bg-gray-800 text-muted-foreground/60 hover:text-white hover:bg-gray-700"
              }`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full mr-2"
              style={{ backgroundColor: s.color }}
            />
            {s.display_name || s.name}
          </button>
        ))}
      </div>

      {/* Orders Grid */}
      {activeOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32">
          <ChefHat className="h-16 w-16 text-foreground/80 mb-4" />
          <p className="text-muted-foreground text-lg font-medium">No active orders</p>
          <p className="text-muted-foreground text-sm mt-1">Orders will appear here when sent to kitchen</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activeOrders.map(order => {
            const pendingItems = order.items.filter(i => i.status === "pending" || i.status === "preparing");
            const readyItems = order.items.filter(i => i.status === "ready");
            const totalActive = pendingItems.length + readyItems.length;

            return (
              <div
                key={order.order_id}
                className={`rounded-2xl border overflow-hidden transition-all duration-300
                  ${getCardStyle(order.elapsed_seconds)} ${getUrgencyGlow(order.elapsed_seconds)}`}
              >
                {/* Order header */}
                <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">#{order.order_id}</span>
                      <span className="text-sm text-muted-foreground/60 font-medium">T{order.table_number}</span>
                    </div>
                    {order.guest_name && (
                      <span className="text-xs text-muted-foreground">{order.guest_name}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`flex items-center gap-1 text-sm font-mono font-bold ${getTimerColor(order.elapsed_seconds)}`}>
                      <Clock className="h-4 w-4" />
                      {formatElapsed(order.elapsed_seconds)}
                    </div>
                    {readyItems.length > 0 && (
                      <span className="text-xs text-emerald-400">
                        {readyItems.length}/{order.items.length} done
                      </span>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div className="px-4 py-3 space-y-2">
                  {order.items
                    .filter(i => i.status !== "served" && i.status !== "cancelled")
                    .map(item => {
                      const isReady = item.status === "ready";
                      const isProcessing = actionInProgress.has(item.id);

                      return (
                        <div key={item.id} className="space-y-1">
                          <div className={`flex items-center justify-between py-2 px-3 rounded-xl transition-all duration-300
                            ${isReady
                              ? "bg-emerald-500/15 border border-emerald-500/20"
                              : "bg-white/5 hover:bg-white/8 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-emerald-400 font-bold text-sm w-6 flex-shrink-0">
                                {item.quantity}×
                              </span>
                              <span className={`text-sm font-medium truncate
                                ${isReady ? "text-emerald-400" : "text-white"}`}
                              >
                                {item.item_name}
                              </span>
                              {item.station && selectedStation === null && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-muted-foreground flex-shrink-0">
                                  {item.station}
                                </span>
                              )}
                            </div>

                            {/* Action button */}
                            {isReady ? (
                              <button
                                onClick={() => recallItem(item.id)}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold
                                  hover:bg-amber-500/20 hover:text-amber-400 transition-all duration-200 group"
                                title="Recall — undo ready"
                              >
                                <Check className="h-3.5 w-3.5 group-hover:hidden" />
                                <Undo2 className="h-3.5 w-3.5 hidden group-hover:block" />
                                <span className="group-hover:hidden">Done</span>
                                <span className="hidden group-hover:inline">Undo</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => markItemReady(item.id)}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-bold
                                  hover:bg-emerald-500/30 active:scale-95 transition-all duration-200
                                  disabled:opacity-50"
                              >
                                {isProcessing ? (
                                  <div className="h-3.5 w-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                                DONE
                              </button>
                            )}
                          </div>

                          {/* Item notes */}
                          {item.notes && (
                            <div className="flex items-start gap-1.5 ml-9 px-2">
                              <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0 mt-0.5" />
                              <span className="text-xs text-amber-400 italic leading-tight">
                                {item.notes}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>

                {/* Bump order button */}
                {pendingItems.length > 0 && (
                  <div className="px-4 py-3 border-t border-white/5">
                    <button
                      onClick={() => bumpOrder(order.order_id)}
                      className="w-full py-3 rounded-xl bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25
                        text-sm font-bold transition-all duration-200 active:scale-[0.98]
                        flex items-center justify-center gap-2"
                    >
                      <Flame className="h-4 w-4" />
                      All Done ({pendingItems.length} remaining)
                    </button>
                  </div>
                )}

                {/* All done indicator */}
                {pendingItems.length === 0 && readyItems.length > 0 && (
                  <div className="px-4 py-3 border-t border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm font-semibold">
                      <Check className="h-4 w-4" />
                      All items ready — awaiting pickup
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
