"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Loading } from "@/components/shared/loading";
import { ApiError } from "@/components/shared/api-error";
import {
  Package,
  AlertTriangle,
  ShoppingCart,
  Plus,
  Search,
  Truck,
  Building2,
  BarChart3,
  RefreshCw,
  Trash2,
  Check,
  Clock,
  ArrowDownUp,
  FileText,
  Settings,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  PackageCheck,
  Scale,
  X,
} from "lucide-react";
import { AuditTimeline } from "@/components/dashboard/audit-timeline";

/* ── types ── */
interface InventoryItem {
  id: number;
  name: string;
  category: string;
  current_stock: number;
  par_level: number;
  unit: string;
  cost_per_unit: number;
  last_ordered: string | null;
}

interface Vendor {
  id: number;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  is_active: boolean;
  delivery_days_json: number[] | null;
  minimum_order_value: number | null;
  catalog_url: string | null;
  payment_terms: string | null;
  lead_time_days: number | null;
}

interface PurchaseOrder {
  id: number;
  vendor_id: number;
  status: string;
  total: number;
  items_json: Record<string, unknown>[];
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  delivery_status: string;
  notes: string | null;
  created_at: string;
}

interface SupplierCatalogItem {
  id: number;
  vendor_id: number;
  inventory_item_id: number;
  supplier_sku: string | null;
  supplier_name: string;
  unit_price: number;
  unit: string;
  min_order_qty: number;
  is_available: boolean;
}

interface AutoPurchaseRule {
  id: number;
  inventory_item_id: number;
  vendor_id: number;
  trigger_type: string;
  reorder_point: number;
  reorder_quantity: number;
  is_active: boolean;
  last_triggered_at: string | null;
}

interface PriceComparison {
  inventory_item_id: number;
  item_name: string;
  vendors: {
    vendor_id: number;
    vendor_name: string;
    unit_price: number;
    unit: string;
    min_order_qty: number;
    is_available: boolean;
  }[];
}

/* ── tab type ── */
type Tab = "items" | "orders" | "vendors" | "catalog" | "rules";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "items", label: "Inventory", icon: Package },
  { key: "orders", label: "Purchase Orders", icon: ShoppingCart },
  { key: "vendors", label: "Vendors", icon: Building2 },
  { key: "catalog", label: "Supplier Catalog", icon: FileText },
  { key: "rules", label: "Auto-Purchase", icon: Settings },
];

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getStockStatus(current: number, par: number) {
  if (current <= par * 0.3) return { label: "Critical", cls: "bg-red-500/10 text-red-400" };
  if (current <= par * 0.7) return { label: "Low", cls: "bg-amber-500/10 text-amber-400" };
  return { label: "OK", cls: "bg-emerald-500/10 text-emerald-400" };
}

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("items");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  /* ── data ── */
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [rules, setRules] = useState<AutoPurchaseRule[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  /* ── modals ── */
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [showAddCatalog, setShowAddCatalog] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [showReceive, setShowReceive] = useState<number | null>(null);
  const [showPriceCompare, setShowPriceCompare] = useState<PriceComparison | null>(null);

  /* ── catalog per vendor ── */
  const [selectedVendorCatalog, setSelectedVendorCatalog] = useState<number | null>(null);
  const [catalogItems, setCatalogItems] = useState<SupplierCatalogItem[]>([]);

  /* ── forms ── */
  const [newItem, setNewItem] = useState({ name: "", category: "", par_level: "", unit: "kg", cost_per_unit: "" });
  const [newVendor, setNewVendor] = useState({ name: "", contact_email: "", contact_phone: "", payment_terms: "", lead_time_days: "", minimum_order_value: "" });
  const [newOrder, setNewOrder] = useState({ vendor_id: 0, total: "", notes: "", expected_delivery_date: "" });
  const [newCatalog, setNewCatalog] = useState({ vendor_id: 0, inventory_item_id: 0, supplier_name: "", unit_price: "", unit: "kg", min_order_qty: "1" });
  const [newRule, setNewRule] = useState({ inventory_item_id: 0, vendor_id: 0, trigger_type: "below_par", reorder_point: "", reorder_quantity: "", is_active: true });
  const [receiveNotes, setReceiveNotes] = useState("");

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const [itemRes, vendorRes, orderRes, lowRes, ruleRes] = await Promise.all([
        api.get("/inventory/items"),
        api.get("/inventory/vendors?active_only=false"),
        api.get("/inventory/orders"),
        api.get("/inventory/low-stock"),
        api.get("/inventory/auto-purchase-rules"),
      ]);
      setItems(itemRes.data);
      setVendors(vendorRes.data);
      setOrders(orderRes.data);
      setLowStock(lowRes.data);
      setRules(ruleRes.data);
    } catch {
      setFetchError("Failed to load inventory data. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const action = params.get("action");
    const filter = params.get("filter");

    if (
      tabParam === "items" ||
      tabParam === "orders" ||
      tabParam === "vendors" ||
      tabParam === "catalog" ||
      tabParam === "rules"
    ) {
      setTab(tabParam);
    }

    setShowLowStockOnly(filter === "low-stock");

    if (action === "new-item") {
      setTab("items");
      setShowAddItem(true);
    }
    if (action === "new-order") {
      setTab("orders");
      setShowAddOrder(true);
    }
    if (action === "new-vendor") {
      setTab("vendors");
      setShowAddVendor(true);
    }
  }, []);

  /* ── helpers ── */
  const getVendorName = (id: number) => vendors.find((v) => v.id === id)?.name ?? `Vendor #${id}`;
  const getItemName = (id: number) => items.find((i) => i.id === id)?.name ?? `Item #${id}`;

  /* ── CRUD handlers ── */
  const handleAddItem = async () => {
    if (!newItem.name) return;
    try {
      await api.post("/inventory/items", {
        ...newItem,
        par_level: parseFloat(newItem.par_level || "0"),
        cost_per_unit: parseFloat(newItem.cost_per_unit || "0"),
      });
      setNewItem({ name: "", category: "", par_level: "", unit: "kg", cost_per_unit: "" });
      setShowAddItem(false);
      fetchData();
    } catch {}
  };

  const handleAddVendor = async () => {
    if (!newVendor.name) return;
    try {
      await api.post("/inventory/vendors", {
        name: newVendor.name,
        contact_email: newVendor.contact_email || null,
        contact_phone: newVendor.contact_phone || null,
        payment_terms: newVendor.payment_terms || null,
        lead_time_days: newVendor.lead_time_days ? parseInt(newVendor.lead_time_days) : null,
        minimum_order_value: newVendor.minimum_order_value ? parseFloat(newVendor.minimum_order_value) : null,
      });
      setNewVendor({ name: "", contact_email: "", contact_phone: "", payment_terms: "", lead_time_days: "", minimum_order_value: "" });
      setShowAddVendor(false);
      fetchData();
    } catch {}
  };

  const handleAddOrder = async () => {
    if (!newOrder.vendor_id || !newOrder.total) return;
    try {
      await api.post("/inventory/orders", {
        vendor_id: newOrder.vendor_id,
        total: parseFloat(newOrder.total),
        order_date: new Date().toISOString().slice(0, 10),
        notes: newOrder.notes || null,
        expected_delivery_date: newOrder.expected_delivery_date || null,
      });
      setNewOrder({ vendor_id: 0, total: "", notes: "", expected_delivery_date: "" });
      setShowAddOrder(false);
      fetchData();
    } catch {}
  };

  const handleReceiveOrder = async (orderId: number) => {
    try {
      await api.post(`/inventory/orders/${orderId}/receive`, { received_items_json: {}, notes: receiveNotes || null });
      setShowReceive(null);
      setReceiveNotes("");
      fetchData();
    } catch {}
  };

  const handleAddCatalogItem = async () => {
    if (!newCatalog.vendor_id || !newCatalog.inventory_item_id) return;
    try {
      await api.post(`/inventory/vendors/${newCatalog.vendor_id}/catalog`, {
        inventory_item_id: newCatalog.inventory_item_id,
        supplier_name: newCatalog.supplier_name || getItemName(newCatalog.inventory_item_id),
        unit_price: parseFloat(newCatalog.unit_price || "0"),
        unit: newCatalog.unit,
        min_order_qty: parseInt(newCatalog.min_order_qty || "1"),
      });
      setNewCatalog({ vendor_id: 0, inventory_item_id: 0, supplier_name: "", unit_price: "", unit: "kg", min_order_qty: "1" });
      setShowAddCatalog(false);
      if (selectedVendorCatalog) fetchVendorCatalog(selectedVendorCatalog);
      fetchData();
    } catch {}
  };

  const handleAddAutoRule = async () => {
    if (!newRule.inventory_item_id || !newRule.vendor_id) return;
    try {
      await api.post("/inventory/auto-purchase-rules", {
        ...newRule,
        reorder_point: parseFloat(newRule.reorder_point || "0"),
        reorder_quantity: parseFloat(newRule.reorder_quantity || "0"),
      });
      setNewRule({ inventory_item_id: 0, vendor_id: 0, trigger_type: "below_par", reorder_point: "", reorder_quantity: "", is_active: true });
      setShowAddRule(false);
      fetchData();
    } catch {}
  };

  const handleToggleRule = async (rule: AutoPurchaseRule) => {
    try {
      await api.put(`/inventory/auto-purchase-rules/${rule.id}`, { is_active: !rule.is_active });
      fetchData();
    } catch {}
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      await api.delete(`/inventory/auto-purchase-rules/${ruleId}`);
      fetchData();
    } catch {}
  };

  const fetchVendorCatalog = async (vendorId: number) => {
    try {
      const res = await api.get(`/inventory/vendors/${vendorId}/catalog`);
      setCatalogItems(res.data);
      setSelectedVendorCatalog(vendorId);
    } catch {}
  };

  const fetchPriceComparison = async (itemId: number) => {
    try {
      const res = await api.get(`/inventory/price-comparison?item_id=${itemId}`);
      setShowPriceCompare(res.data);
    } catch {}
  };

  /* ── filtered data ── */
  const lowStockIds = new Set(lowStock.map((item) => item.id));
  const filteredItems = items.filter((item) => {
    if (showLowStockOnly && !lowStockIds.has(item.id)) {
      return false;
    }
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });
  const pendingOrders = orders.filter((o) => o.status === "pending" || o.status === "ordered");

  if (loading) {
    return <Loading size="lg" className="min-h-[60vh]" />;
  }

  return (
    <div className="space-y-6">
      {fetchError && <ApiError message={fetchError} onRetry={fetchData} />}
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="h-7 w-7 text-accent-DEFAULT" />
            Inventory & Procurement
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stock levels, purchase orders, vendors, and automated reordering
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "items" && (
            <button onClick={() => setShowAddItem(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white hover:bg-accent-dark transition-colors text-sm font-medium">
              <Plus className="h-4 w-4" /> Add Item
            </button>
          )}
          {tab === "orders" && (
            <button onClick={() => setShowAddOrder(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white hover:bg-accent-dark transition-colors text-sm font-medium">
              <Plus className="h-4 w-4" /> New Order
            </button>
          )}
          {tab === "vendors" && (
            <button onClick={() => setShowAddVendor(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white hover:bg-accent-dark transition-colors text-sm font-medium">
              <Plus className="h-4 w-4" /> Add Vendor
            </button>
          )}
          {tab === "catalog" && (
            <button onClick={() => setShowAddCatalog(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white hover:bg-accent-dark transition-colors text-sm font-medium">
              <Plus className="h-4 w-4" /> Add Catalog Entry
            </button>
          )}
          {tab === "rules" && (
            <button onClick={() => setShowAddRule(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white hover:bg-accent-dark transition-colors text-sm font-medium">
              <Plus className="h-4 w-4" /> Add Rule
            </button>
          )}
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Items", value: items.length, icon: Package, color: "text-blue-400" },
          { label: "Low Stock", value: lowStock.length, icon: AlertTriangle, color: lowStock.length > 0 ? "text-red-400" : "text-emerald-400" },
          { label: "Pending Orders", value: pendingOrders.length, icon: ShoppingCart, color: "text-amber-400" },
          { label: "Active Vendors", value: vendors.filter((v) => v.is_active).length, icon: Building2, color: "text-purple-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
            <stat.icon className={`h-5 w-5 ${stat.color}`} />
            <div>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-card rounded-xl border border-border p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key
                ? "bg-accent-DEFAULT text-white shadow"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <AuditTimeline compact title="Inventory Action Timeline" entityType="inventory" limit={12} />

      {/* ── Tab: Items ── */}
      {tab === "items" && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search inventory..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
            />
          </div>

          {showLowStockOnly && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400">
                Low-stock filter active
              </span>
              <button
                onClick={() => setShowLowStockOnly(false)}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Clear filter
              </button>
            </div>
          )}

          {/* low stock alert */}
          {lowStock.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className="text-sm font-medium text-red-400">
                  {lowStock.length} item{lowStock.length > 1 ? "s" : ""} below reorder level
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {lowStock.slice(0, 8).map((item) => (
                  <span key={item.id} className="px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs">
                    {item.name}: {item.current_stock} {item.unit}
                  </span>
                ))}
                {lowStock.length > 8 && (
                  <span className="px-2 py-1 text-xs text-red-400">+{lowStock.length - 8} more</span>
                )}
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">PAR Level</th>
                  <th className="px-4 py-3 text-right">Unit Cost</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const status = getStockStatus(item.current_stock, item.par_level);
                  return (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground text-sm">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">
                        {item.current_stock} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {item.par_level} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        &euro;{(item.cost_per_unit || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => fetchPriceComparison(item.id)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Compare prices"
                          >
                            <Scale className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredItems.length === 0 && (
              <div className="p-10 text-center text-muted-foreground text-sm">No inventory items found</div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Purchase Orders ── */}
      {tab === "orders" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3">Expected</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">#{order.id}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{getVendorName(order.vendor_id)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                    &euro;{order.total.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      order.status === "received" ? "bg-emerald-500/10 text-emerald-400" :
                      order.status === "ordered" ? "bg-blue-500/10 text-blue-400" :
                      order.status === "cancelled" ? "bg-red-500/10 text-red-400" :
                      "bg-amber-500/10 text-amber-400"
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      order.delivery_status === "delivered" ? "bg-emerald-500/10 text-emerald-400" :
                      order.delivery_status === "in_transit" ? "bg-blue-500/10 text-blue-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {order.delivery_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {order.expected_delivery_date || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[120px]">
                    {order.notes || "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {(order.status === "pending" || order.status === "ordered") && (
                        <button
                          onClick={() => setShowReceive(order.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium transition-colors"
                        >
                          <PackageCheck className="h-3 w-3" />
                          Receive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && (
            <div className="p-10 text-center text-muted-foreground text-sm">No purchase orders</div>
          )}
        </div>
      )}

      {/* ── Tab: Vendors ── */}
      {tab === "vendors" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((vendor) => (
            <div
              key={vendor.id}
              className={`bg-card rounded-2xl border border-border p-5 space-y-3 hover:shadow-lg transition-shadow ${
                !vendor.is_active ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-accent-DEFAULT" />
                    {vendor.name}
                  </h3>
                  {vendor.contact_email && (
                    <p className="text-xs text-muted-foreground mt-0.5">{vendor.contact_email}</p>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  vendor.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                }`}>
                  {vendor.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {vendor.payment_terms && (
                  <div>
                    <span className="text-muted-foreground">Terms: </span>
                    <span className="text-foreground">{vendor.payment_terms}</span>
                  </div>
                )}
                {vendor.lead_time_days != null && (
                  <div>
                    <span className="text-muted-foreground">Lead time: </span>
                    <span className="text-foreground">{vendor.lead_time_days}d</span>
                  </div>
                )}
                {vendor.minimum_order_value != null && (
                  <div>
                    <span className="text-muted-foreground">Min order: </span>
                    <span className="text-foreground">&euro;{vendor.minimum_order_value}</span>
                  </div>
                )}
                {vendor.contact_phone && (
                  <div>
                    <span className="text-muted-foreground">Phone: </span>
                    <span className="text-foreground">{vendor.contact_phone}</span>
                  </div>
                )}
              </div>

              {vendor.delivery_days_json && vendor.delivery_days_json.length > 0 && (
                <div className="flex gap-1">
                  {DAY_NAMES.map((day, i) => (
                    <span
                      key={day}
                      className={`px-1.5 py-0.5 rounded text-xs ${
                        vendor.delivery_days_json!.includes(i + 1)
                          ? "bg-accent-DEFAULT/20 text-accent-DEFAULT font-medium"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {day}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => fetchVendorCatalog(vendor.id)}
                className="flex items-center gap-1 text-xs text-accent-DEFAULT hover:underline"
              >
                View Catalog <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          ))}
          {vendors.length === 0 && (
            <div className="col-span-full bg-card rounded-2xl border border-border p-10 text-center text-muted-foreground text-sm">
              No vendors yet
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Supplier Catalog ── */}
      {tab === "catalog" && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {vendors.filter((v) => v.is_active).map((v) => (
              <button
                key={v.id}
                onClick={() => fetchVendorCatalog(v.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedVendorCatalog === v.id
                    ? "bg-accent-DEFAULT text-white shadow"
                    : "bg-card text-muted-foreground border border-border hover:text-foreground"
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>

          {selectedVendorCatalog ? (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3">Supplier Name</th>
                    <th className="px-4 py-3">Our Item</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3 text-right">Min Qty</th>
                    <th className="px-4 py-3">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogItems.map((ci) => (
                    <tr key={ci.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{ci.supplier_name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{getItemName(ci.inventory_item_id)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{ci.supplier_sku || "\u2014"}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">&euro;{ci.unit_price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{ci.unit}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">{ci.min_order_qty}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          ci.is_available ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                        }`}>
                          {ci.is_available ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {catalogItems.length === 0 && (
                <div className="p-10 text-center text-muted-foreground text-sm">
                  No catalog items for this vendor
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border p-10 text-center text-muted-foreground text-sm">
              Select a vendor to view their catalog
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Auto-Purchase Rules ── */}
      {tab === "rules" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-6 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Rules that automatically generate purchase orders when stock falls below thresholds.
            </p>
          </div>
          {rules.length > 0 ? (
            <div className="divide-y divide-border/50">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`px-6 py-4 flex items-center justify-between hover:bg-muted/20 transition-colors ${
                    !rule.is_active ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-medium text-foreground">{getItemName(rule.inventory_item_id)}</span>
                      <span className="text-muted-foreground mx-2">from</span>
                      <span className="font-medium text-accent-DEFAULT">{getVendorName(rule.vendor_id)}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium">
                      {rule.trigger_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0 ml-4">
                    <div className="text-xs text-muted-foreground text-right">
                      <div>Reorder at: <span className="text-foreground font-medium">{rule.reorder_point}</span></div>
                      <div>Order qty: <span className="text-foreground font-medium">{rule.reorder_quantity}</span></div>
                    </div>
                    {rule.last_triggered_at && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(rule.last_triggered_at).toLocaleDateString()}
                      </span>
                    )}
                    <button onClick={() => handleToggleRule(rule)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {rule.is_active ? <ToggleRight className="h-5 w-5 text-emerald-400" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => handleDeleteRule(rule.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center text-muted-foreground text-sm">
              <RefreshCw className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
              No auto-purchase rules. Create rules to automate reordering.
            </div>
          )}
        </div>
      )}

      {/* ── Add Item Modal ── */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground">Add Inventory Item</h2>
            {[
              { label: "Name", key: "name", type: "text", placeholder: "e.g. Olive Oil" },
              { label: "Category", key: "category", type: "text", placeholder: "e.g. Oils & Fats" },
              { label: "PAR Level", key: "par_level", type: "number", placeholder: "Min stock level" },
              { label: "Unit", key: "unit", type: "text", placeholder: "kg, L, pcs" },
              { label: "Unit Cost (\u20AC)", key: "cost_per_unit", type: "number", placeholder: "0.00" },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(newItem as Record<string, string>)[f.key]}
                  onChange={(e) => setNewItem({ ...newItem, [f.key]: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddItem(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddItem} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Add Item</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Vendor Modal ── */}
      {showAddVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground">Add Vendor</h2>
            {[
              { label: "Name", key: "name", type: "text", placeholder: "Vendor name" },
              { label: "Email", key: "contact_email", type: "email", placeholder: "vendor@example.com" },
              { label: "Phone", key: "contact_phone", type: "text", placeholder: "+43..." },
              { label: "Payment Terms", key: "payment_terms", type: "text", placeholder: "Net 30" },
              { label: "Lead Time (days)", key: "lead_time_days", type: "number", placeholder: "3" },
              { label: "Min Order (\u20AC)", key: "minimum_order_value", type: "number", placeholder: "50" },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(newVendor as Record<string, string>)[f.key]}
                  onChange={(e) => setNewVendor({ ...newVendor, [f.key]: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddVendor(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddVendor} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Add Vendor</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Order Modal ── */}
      {showAddOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground">New Purchase Order</h2>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Vendor</label>
              <select
                value={newOrder.vendor_id}
                onChange={(e) => setNewOrder({ ...newOrder, vendor_id: parseInt(e.target.value) })}
                className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
              >
                <option value={0}>Select vendor</option>
                {vendors.filter((v) => v.is_active).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Total Amount (&euro;)</label>
              <input type="number" step="0.01" placeholder="0.00" value={newOrder.total} onChange={(e) => setNewOrder({ ...newOrder, total: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Expected Delivery</label>
              <input type="date" value={newOrder.expected_delivery_date} onChange={(e) => setNewOrder({ ...newOrder, expected_delivery_date: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
              <textarea placeholder="Order notes..." value={newOrder.notes} onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50 h-20 resize-none" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddOrder(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddOrder} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Create Order</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receive Order Modal ── */}
      {showReceive !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-emerald-400" />
              Receive Order #{showReceive}
            </h2>
            <p className="text-sm text-muted-foreground">
              Mark this order as received. Stock levels will be updated automatically.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Receiving Notes</label>
              <textarea
                placeholder="Any discrepancies, damaged items..."
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50 h-20 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowReceive(null); setReceiveNotes(""); }} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={() => handleReceiveOrder(showReceive)} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors">
                Confirm Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Catalog Item Modal ── */}
      {showAddCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground">Add Catalog Entry</h2>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Vendor</label>
              <select value={newCatalog.vendor_id} onChange={(e) => setNewCatalog({ ...newCatalog, vendor_id: parseInt(e.target.value) })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50">
                <option value={0}>Select vendor</option>
                {vendors.filter((v) => v.is_active).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Inventory Item</label>
              <select value={newCatalog.inventory_item_id} onChange={(e) => setNewCatalog({ ...newCatalog, inventory_item_id: parseInt(e.target.value) })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50">
                <option value={0}>Select item</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Supplier Name</label>
                <input type="text" placeholder="Supplier product name" value={newCatalog.supplier_name} onChange={(e) => setNewCatalog({ ...newCatalog, supplier_name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Unit Price (&euro;)</label>
                <input type="number" step="0.01" placeholder="0.00" value={newCatalog.unit_price} onChange={(e) => setNewCatalog({ ...newCatalog, unit_price: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Unit</label>
                <input type="text" placeholder="kg, L" value={newCatalog.unit} onChange={(e) => setNewCatalog({ ...newCatalog, unit: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Min Order Qty</label>
                <input type="number" value={newCatalog.min_order_qty} onChange={(e) => setNewCatalog({ ...newCatalog, min_order_qty: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddCatalog(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddCatalogItem} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Add Entry</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Auto-Purchase Rule Modal ── */}
      {showAddRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-accent-DEFAULT" />
              Auto-Purchase Rule
            </h2>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Inventory Item</label>
              <select value={newRule.inventory_item_id} onChange={(e) => setNewRule({ ...newRule, inventory_item_id: parseInt(e.target.value) })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50">
                <option value={0}>Select item</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Preferred Vendor</label>
              <select value={newRule.vendor_id} onChange={(e) => setNewRule({ ...newRule, vendor_id: parseInt(e.target.value) })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50">
                <option value={0}>Select vendor</option>
                {vendors.filter((v) => v.is_active).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Trigger Type</label>
              <select value={newRule.trigger_type} onChange={(e) => setNewRule({ ...newRule, trigger_type: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50">
                <option value="below_par">Below PAR Level</option>
                <option value="below_custom">Below Custom Point</option>
                <option value="schedule">Scheduled</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Reorder Point</label>
                <input type="number" placeholder="Stock level trigger" value={newRule.reorder_point} onChange={(e) => setNewRule({ ...newRule, reorder_point: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Reorder Qty</label>
                <input type="number" placeholder="Amount to order" value={newRule.reorder_quantity} onChange={(e) => setNewRule({ ...newRule, reorder_quantity: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={newRule.is_active} onChange={(e) => setNewRule({ ...newRule, is_active: e.target.checked })} className="rounded border-border" />
              Active
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddRule(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddAutoRule} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Create Rule</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Price Comparison Modal ── */}
      {showPriceCompare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Scale className="h-5 w-5 text-accent-DEFAULT" />
                Price Comparison: {showPriceCompare.item_name}
              </h2>
              <button onClick={() => setShowPriceCompare(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {showPriceCompare.vendors && showPriceCompare.vendors.length > 0 ? (
              <div className="space-y-2">
                {showPriceCompare.vendors
                  .sort((a, b) => a.unit_price - b.unit_price)
                  .map((v, i) => (
                    <div
                      key={v.vendor_id}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        i === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-border"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground flex items-center gap-2">
                          {v.vendor_name}
                          {i === 0 && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400">Best</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Min qty: {v.min_order_qty} {v.unit}
                          {!v.is_available && " \u00B7 Currently unavailable"}
                        </p>
                      </div>
                      <span className={`text-lg font-bold ${i === 0 ? "text-emerald-400" : "text-foreground"}`}>
                        &euro;{v.unit_price.toFixed(2)}/{v.unit}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                No suppliers found for this item. Add catalog entries first.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
