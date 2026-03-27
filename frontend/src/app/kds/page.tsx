"use client";

import { useEffect, useState, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { ApiError } from "@/components/shared/api-error";
import {
  ChefHat,
  Clock,
  Check,
  AlertTriangle,
  RefreshCw,
  Flame,
  Volume2,
  ArrowRight,
} from "lucide-react";
import { useWebSocket } from "@/lib/websocket";

/* ── types ── */
interface KDSItem {
  id: number;
  menu_item_id: number;
  item_name: string;
  quantity: number;
  notes: string | null;
  status: string;
  station: string | null;
  course_number: number;
}

interface KDSOrder {
  order_id: number;
  table_id: number;
  table_number: string;
  guest_name: string | null;
  status: string;
  created_at: string;
  elapsed_seconds: number;
  items: KDSItem[];
}

interface KDSStation {
  id: number;
  name: string;
  display_name: string;
  color: string;
  is_active: boolean;
}

const API_BASE = getApiBaseUrl(process.env);

function getToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("access_token");
  }
  return null;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getTimerColor(seconds: number): string {
  if (seconds < 300) return "text-emerald-400"; // < 5 min
  if (seconds < 600) return "text-amber-400";   // < 10 min
  return "text-red-400";                         // > 10 min
}

function getTimerBg(seconds: number): string {
  if (seconds < 300) return "border-emerald-500/30 bg-emerald-500/5";
  if (seconds < 600) return "border-amber-500/30 bg-amber-500/5";
  return "border-red-500/30 bg-red-500/5 animate-pulse";
}

export default function KDSPage() {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [stations, setStations] = useState<KDSStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const stationParam = selectedStation ? `?station=${selectedStation}` : "";
      const [ordersRes, stationsRes] = await Promise.all([
        fetch(`${API_BASE}/billing/kds/orders${stationParam}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/billing/kds/stations`, { headers: authHeaders() }),
      ]);
      if (!ordersRes.ok || !stationsRes.ok) {
        throw new Error(`KDS request failed: orders=${ordersRes.status} stations=${stationsRes.status}`);
      }
      setOrders(await ordersRes.json());
      setStations(await stationsRes.json());
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Failed to load KDS data", error);
      setFetchError("Failed to load kitchen display data.");
    } finally {
      setLoading(false);
    }
  }, [selectedStation]);

  useEffect(() => {
    fetchData();
    // Keep 30s fallback polling just in case, but WS will handle real-time
    const interval = setInterval(fetchData, 30000); 
    return () => clearInterval(interval);
  }, [fetchData]);

  // WebSocket for real-time updates
  useWebSocket("NEW_ORDER", (data) => {
    console.log("New order received via WS:", data);
    fetchData(); // Simplest: re-fetch all active orders
    // In a more complex app, we could append to 'orders' state directly
  });

  // Timer tick — update elapsed seconds locally
  useEffect(() => {
    const tick = setInterval(() => {
      setOrders((prev) =>
        prev.map((o) => ({ ...o, elapsed_seconds: o.elapsed_seconds + 1 }))
      );
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const markItemReady = async (itemId: number) => {
    try {
      const response = await fetch(`${API_BASE}/billing/kds/items/${itemId}/ready`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error(`ready failed with ${response.status}`);
      }
      fetchData();
    } catch (error) {
      console.error("Failed to mark KDS item ready", error);
      setFetchError("Failed to update kitchen item status.");
    }
  };

  const markItemServed = async (itemId: number) => {
    try {
      const response = await fetch(`${API_BASE}/billing/kds/items/${itemId}/served`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error(`served failed with ${response.status}`);
      }
      fetchData();
    } catch (error) {
      console.error("Failed to mark KDS item served", error);
      setFetchError("Failed to update kitchen item status.");
    }
  };

  const bumpOrder = async (orderId: number) => {
    try {
      const response = await fetch(`${API_BASE}/billing/kds/orders/${orderId}/bump`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error(`bump failed with ${response.status}`);
      }
      fetchData();
    } catch (error) {
      console.error("Failed to bump KDS order", error);
      setFetchError("Failed to update kitchen order.");
    }
  };

  const recallItem = async (itemId: number) => {
    try {
      const response = await fetch(`${API_BASE}/billing/kds/items/${itemId}/recall`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error(`recall failed with ${response.status}`);
      }
      fetchData();
    } catch (error) {
      console.error("Failed to recall KDS item", error);
      setFetchError("Failed to update kitchen item status.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ChefHat className="h-8 w-8 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold">Kitchen Display</h1>
            <p className="text-xs text-muted-foreground">
              {orders.length} active order{orders.length !== 1 ? "s" : ""} &middot; Updated{" "}
              {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-muted-foreground/60"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="mb-4">
          <ApiError
            message={fetchError}
            onRetry={() => {
              void fetchData();
            }}
          />
        </div>
      )}

      {/* ── Station Tabs ── */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedStation(null)}
          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedStation === null
              ? "bg-emerald-500 text-white"
              : "bg-gray-800 text-muted-foreground/60 hover:text-white"
            }`}
        >
          All Stations
        </button>
        {stations
          .filter((s) => s.is_active)
          .map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedStation(s.name)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedStation === s.name
                  ? "bg-emerald-500 text-white"
                  : "bg-gray-800 text-muted-foreground/60 hover:text-white"
                }`}
            >
              {s.display_name || s.name}
            </button>
          ))}
      </div>

      {/* ── Orders Grid ── */}
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32">
          <ChefHat className="h-16 w-16 text-foreground/80 mb-4" />
          <p className="text-muted-foreground text-lg">No active orders</p>
          <p className="text-muted-foreground text-sm">Orders will appear here when sent to kitchen</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {orders.map((order) => (
            <div
              key={order.order_id}
              className={`rounded-2xl border ${getTimerBg(order.elapsed_seconds)} overflow-hidden`}
            >
              {/* order header */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
                <div>
                  <span className="text-lg font-bold">#{order.order_id}</span>
                  <span className="ml-2 text-sm text-muted-foreground/60">T{order.table_number}</span>
                  {order.guest_name && (
                    <span className="ml-1 text-xs text-muted-foreground">&middot; {order.guest_name}</span>
                  )}
                </div>
                <div className={`flex items-center gap-1 text-sm font-mono font-bold ${getTimerColor(order.elapsed_seconds)}`}>
                  <Clock className="h-4 w-4" />
                  {formatElapsed(order.elapsed_seconds)}
                </div>
              </div>

              {/* items */}
              <div className="px-4 py-2 space-y-1.5">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors ${item.status === "ready"
                        ? "bg-emerald-500/10"
                        : item.status === "served"
                          ? "bg-gray-800/50 opacity-40"
                          : "hover:bg-white/5"
                      }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-emerald-400 font-bold text-sm w-5">{item.quantity}x</span>
                      <span className={`text-sm truncate ${item.status === "ready" ? "text-emerald-400 line-through" :
                          item.status === "served" ? "text-muted-foreground line-through" :
                            "text-white"
                        }`}>
                        {item.item_name}
                      </span>
                      {item.station && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          [{item.station}]
                        </span>
                      )}
                    </div>
                    {item.status === "pending" || item.status === "preparing" ? (
                      <button
                        onClick={() => markItemReady(item.id)}
                        className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                        title="Mark ready"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    ) : item.status === "ready" ? (
                      <button
                        onClick={() => markItemServed(item.id)}
                        className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                        title="Mark served"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
                {order.items.some((i) => i.notes) && (
                  <div className="text-xs text-amber-400 italic px-2">
                    {order.items
                      .filter((i) => i.notes)
                      .map((i) => `${i.item_name}: ${i.notes}`)
                      .join(" | ")}
                  </div>
                )}
              </div>

              {/* bump button */}
              <div className="px-4 py-2 border-t border-white/5">
                <button
                  onClick={() => bumpOrder(order.order_id)}
                  className="w-full py-2 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Flame className="h-4 w-4" />
                  Bump Order
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
