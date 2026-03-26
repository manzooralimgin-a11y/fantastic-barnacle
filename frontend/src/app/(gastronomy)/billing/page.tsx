"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Loading } from "@/components/shared/loading";
import { ApiError } from "@/components/shared/api-error";
import {
  Receipt,
  Plus,
  ShoppingCart,
  CreditCard,
  Banknote,
  Clock,
  CheckCircle2,
  Minus,
  Split,
  DollarSign,
  TrendingUp,
  Hash,
  ArrowRight,
  Send,
  CircleDot,
  Utensils,
  Undo2,
  Wallet,
  Mail,
  Phone,
  Link2,
  Gift,
} from "lucide-react";
import { AuditTimeline } from "@/components/dashboard/audit-timeline";

/* ── types ── */
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

interface TableOrder {
  id: number;
  session_id: number | null;
  table_id: number | null;
  server_id: number | null;
  status: string;
  order_type: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  discount_reason: string | null;
  tip_amount: number;
  total: number;
  notes: string | null;
  guest_name: string | null;
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

interface MenuItemType {
  id: number;
  category_id: number;
  name: string;
  price: number;
  is_available: boolean;
}

interface MenuCategoryType {
  id: number;
  name: string;
}

interface BillType {
  id: number;
  order_id: number;
  bill_number: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  service_charge: number;
  discount_amount: number;
  tip_amount: number;
  total: number;
  split_type: string;
  split_count: number;
  status: string;
  paid_at: string | null;
  receipt_token: string | null;
  receipt_email: string | null;
  receipt_phone: string | null;
}

interface DailySummary {
  date: string;
  total_orders: number;
  total_revenue: number;
  total_tax: number;
  total_tips: number;
  total_discounts: number;
  payment_breakdown: Record<string, number>;
  avg_order_value: number;
}

interface TableItem {
  id: number;
  table_number: string;
  status: string;
  capacity: number;
}

interface CashShiftType {
  id: number;
  opened_by: number;
  closed_by: number | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  variance: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

/* ── status helpers ── */
const ORDER_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: "bg-blue-500/10", text: "text-blue-400" },
  submitted: { bg: "bg-amber-500/10", text: "text-amber-400" },
  preparing: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  served: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  closed: { bg: "bg-muted", text: "text-muted-foreground" },
};

const ITEM_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-muted", text: "text-muted-foreground" },
  preparing: { bg: "bg-amber-500/10", text: "text-amber-400" },
  ready: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  served: { bg: "bg-blue-500/10", text: "text-blue-400" },
  cancelled: { bg: "bg-red-500/10", text: "text-red-400" },
};

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<"pos" | "orders" | "summary" | "shifts">("pos");
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemType[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategoryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  /* POS state */
  const [selectedOrder, setSelectedOrder] = useState<TableOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemType[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [bill, setBill] = useState<BillType | null>(null);
  const [newOrderTableId, setNewOrderTableId] = useState<number | null>(null);
  const [newOrderType, setNewOrderType] = useState("dine_in");

  /* Payment state (F5) */
  const [tipPercent, setTipPercent] = useState<number>(0);
  const [cardLastFour, setCardLastFour] = useState("");
  const [cardBrand, setCardBrand] = useState("visa");
  const [walletType, setWalletType] = useState("apple_pay");
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherError, setVoucherError] = useState("");

  /* Receipt state (F8) */
  const [receiptEmail, setReceiptEmail] = useState("");
  const [receiptPhone, setReceiptPhone] = useState("");
  const [showSendReceipt, setShowSendReceipt] = useState(false);

  /* Cash shift state (F5) */
  const [cashShifts, setCashShifts] = useState<CashShiftType[]>([]);
  const [currentShift, setCurrentShift] = useState<CashShiftType | null>(null);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [shiftAmount, setShiftAmount] = useState("");

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const [ordersRes, summaryRes, tablesRes, menuRes, catRes] = await Promise.all([
        api.get("/billing/orders/live"),
        api.get("/billing/daily-summary"),
        api.get("/reservations/tables"),
        api.get("/menu/items?available=true"),
        api.get("/menu/categories"),
      ]);
      setActiveOrders(ordersRes.data);
      setDailySummary(summaryRes.data);
      setTables(tablesRes.data);
      setMenuItems(menuRes.data);
      setMenuCategories(catRes.data);
    } catch {
      setFetchError("Failed to load billing data. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCashShifts = useCallback(async () => {
    try {
      const [shiftsRes, currentRes] = await Promise.all([
        api.get("/billing/cash-shifts"),
        api.get("/billing/cash-shifts/current"),
      ]);
      setCashShifts(shiftsRes.data);
      if (currentRes.data.status !== "no_open_shift") {
        setCurrentShift(currentRes.data);
      } else {
        setCurrentShift(null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    fetchCashShifts();
  }, [fetchData, fetchCashShifts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const action = params.get("action");

    if (tab === "orders" || tab === "summary" || tab === "shifts" || tab === "pos") {
      setActiveTab(tab);
    }

    if (action === "new-order") {
      setActiveTab("pos");
      setShowNewOrder(true);
      setSelectedOrder(null);
      setOrderItems([]);
      setBill(null);
    }
  }, []);

  /* load order detail */
  const loadOrder = async (orderId: number) => {
    try {
      const [orderRes, itemsRes] = await Promise.all([
        api.get(`/billing/orders/${orderId}`),
        api.get(`/billing/orders/${orderId}/items`),
      ]);
      setSelectedOrder(orderRes.data);
      setOrderItems(itemsRes.data);
      try {
        const billRes = await api.get(`/billing/bills/by-order/${orderId}`);
        setBill(billRes.data);
      } catch {
        setBill(null);
      }
    } catch {}
  };

  /* POS actions */
  const handleCreateOrder = async () => {
    try {
      const res = await api.post("/billing/orders", {
        table_id: newOrderTableId,
        order_type: newOrderType,
      });
      setShowNewOrder(false);
      setNewOrderTableId(null);
      await loadOrder(res.data.id);
      fetchData();
    } catch {}
  };

  const handleAddToOrder = async (menuItem: MenuItemType) => {
    if (!selectedOrder) return;
    try {
      await api.post(`/billing/orders/${selectedOrder.id}/items`, {
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        quantity: 1,
        unit_price: menuItem.price,
      });
      await loadOrder(selectedOrder.id);
      fetchData();
    } catch {}
  };

  const handleUpdateQuantity = async (item: OrderItemType, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      try {
        await api.delete(`/billing/items/${item.id}`);
        await loadOrder(item.order_id);
        fetchData();
      } catch {}
    } else {
      try {
        await api.put(`/billing/items/${item.id}`, { quantity: newQty });
        await loadOrder(item.order_id);
        fetchData();
      } catch {}
    }
  };

  const handleSendToKitchen = async () => {
    if (!selectedOrder) return;
    try {
      await api.post(`/billing/orders/${selectedOrder.id}/send-to-kitchen`);
      await loadOrder(selectedOrder.id);
      fetchData();
    } catch {}
  };

  const handleGenerateBill = async () => {
    if (!selectedOrder) return;
    try {
      const res = await api.post("/billing/bills", {
        order_id: selectedOrder.id,
        tax_rate: 0.1,
        receipt_email: receiptEmail || undefined,
        receipt_phone: receiptPhone || undefined,
      });
      setBill(res.data);
      setShowPayment(true);
    } catch {}
  };

  const handlePayment = async () => {
    if (!bill || !paymentMethod) return;
    const tipAmount = tipPercent > 0 ? Math.round(bill.total * tipPercent) / 100 : 0;
    
    setVoucherError("");
    if (paymentMethod === "voucher") {
      if (!voucherCode.trim()) {
        setVoucherError("Please enter or scan a voucher code.");
        return;
      }
      try {
        await api.post("/vouchers/redeem", {
          code: voucherCode,
          order_id: selectedOrder?.id,
          deduction_amount: bill.total + tipAmount,
        });
      } catch (err: any) {
        setVoucherError(err.response?.data?.detail || "Invalid voucher code or insufficient remaining balance.");
        return;
      }
    }

    try {
      await api.post("/billing/payments", {
        bill_id: bill.id,
        amount: bill.total + tipAmount,
        method: paymentMethod,
        tip_amount: tipAmount,
        card_last_four: paymentMethod === "card" ? cardLastFour || undefined : undefined,
        card_brand: paymentMethod === "card" ? cardBrand : undefined,
        wallet_type: paymentMethod === "mobile" ? walletType : undefined,
      });
      setShowPayment(false);
      setPaymentMethod(null);
      setTipPercent(0);
      setCardLastFour("");
      setVoucherCode("");
      setVoucherError("");
      if (bill.receipt_token) {
        setShowSendReceipt(true);
      } else {
        setBill(null);
        setSelectedOrder(null);
        setOrderItems([]);
      }
      fetchData();
    } catch {}
  };

  const handleRefund = async (paymentId: number) => {
    try {
      await api.post(`/billing/payments/${paymentId}/refund`, { reason: "Customer request" });
      fetchData();
    } catch {}
  };

  const handleSendReceipt = async () => {
    if (!bill) return;
    try {
      await api.post(`/billing/bills/${bill.id}/send-receipt`, {
        email: receiptEmail || undefined,
        phone: receiptPhone || undefined,
      });
      setShowSendReceipt(false);
      setBill(null);
      setSelectedOrder(null);
      setOrderItems([]);
      setReceiptEmail("");
      setReceiptPhone("");
    } catch {}
  };

  /* Cash shift actions */
  const handleOpenShift = async () => {
    try {
      await api.post("/billing/cash-shifts/open", {
        opening_amount: parseFloat(shiftAmount) || 0,
      });
      setShowOpenShift(false);
      setShiftAmount("");
      fetchCashShifts();
    } catch {}
  };

  const handleCloseShift = async () => {
    if (!currentShift) return;
    try {
      await api.post(`/billing/cash-shifts/${currentShift.id}/close`, {
        closing_amount: parseFloat(shiftAmount) || 0,
      });
      setShowCloseShift(false);
      setShiftAmount("");
      fetchCashShifts();
    } catch {}
  };

  const filteredMenu = selectedCategoryId
    ? menuItems.filter((m) => m.category_id === selectedCategoryId)
    : menuItems;

  if (loading) {
    return <Loading size="lg" className="min-h-[60vh]" />;
  }

  return (
    <div className="space-y-6">
      {fetchError && <ApiError message={fetchError} onRetry={fetchData} />}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-7 w-7 text-accent-DEFAULT" />
            Billing & POS
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Take orders, manage bills, process payments & cash shifts
          </p>
        </div>
        <button
          onClick={() => setShowNewOrder(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white hover:bg-accent-dark transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Order
        </button>
      </div>

      {/* Daily Summary Bar */}
      {dailySummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "Orders Today", value: dailySummary.total_orders, icon: ShoppingCart, color: "text-blue-400" },
            { label: "Revenue", value: `€${dailySummary.total_revenue.toFixed(2)}`, icon: TrendingUp, color: "text-emerald-400" },
            { label: "Avg Order", value: `€${dailySummary.avg_order_value.toFixed(2)}`, icon: DollarSign, color: "text-amber-400" },
            { label: "Tax", value: `€${dailySummary.total_tax.toFixed(2)}`, icon: Receipt, color: "text-purple-400" },
            { label: "Tips", value: `€${dailySummary.total_tips.toFixed(2)}`, icon: Banknote, color: "text-cyan-400" },
            { label: "Discounts", value: `€${dailySummary.total_discounts.toFixed(2)}`, icon: Hash, color: "text-red-400" },
          ].map((stat) => (
            <div key={stat.label} className="glass-card p-3 flex items-center gap-3">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              <div>
                <p className="text-lg font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 glass-card p-1">
        {(["pos", "orders", "summary", "shifts"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === "shifts") fetchCashShifts();
            }}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? "bg-accent-DEFAULT text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "pos" && "🖥️ POS Terminal"}
            {tab === "orders" && `📦 Active Orders (${activeOrders.length})`}
            {tab === "summary" && "📊 Daily Summary"}
            {tab === "shifts" && "💰 Cash Shifts"}
          </button>
        ))}
      </div>

      <AuditTimeline
        compact
        title="Billing Action Timeline"
        entityType="billing"
        entityId={selectedOrder?.id ?? null}
        limit={12}
      />

      {/* POS Terminal */}
      {activeTab === "pos" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Menu browser */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setSelectedCategoryId(null)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedCategoryId === null
                    ? "bg-accent-DEFAULT text-white"
                    : "bg-card border border-border text-muted-foreground"
                }`}
              >
                All
              </button>
              {menuCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedCategoryId === cat.id
                      ? "bg-accent-DEFAULT text-white"
                      : "bg-card border border-border text-muted-foreground"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {filteredMenu.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-12 text-center">
                <Utensils className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No menu items available</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredMenu.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAddToOrder(item)}
                    disabled={!selectedOrder}
                    className={`glass-card p-4 text-left hover:shadow-md hover:border-accent-DEFAULT/50 transition-all ${
                      !selectedOrder ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-95"
                    }`}
                  >
                    <p className="font-medium text-foreground text-sm truncate">{item.name}</p>
                    <p className="text-accent-DEFAULT font-bold mt-1">€{item.price.toFixed(2)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Current order */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border">
              {selectedOrder ? (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-foreground">Order #{selectedOrder.id}</h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedOrder.order_type === "dine_in" ? "Dine-in" : selectedOrder.order_type}
                      {selectedOrder.table_id && ` · Table ${tables.find((t) => t.id === selectedOrder.table_id)?.table_number || ""}`}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(ORDER_STATUS_COLORS[selectedOrder.status] || ORDER_STATUS_COLORS.open).bg} ${(ORDER_STATUS_COLORS[selectedOrder.status] || ORDER_STATUS_COLORS.open).text}`}>
                    {selectedOrder.status}
                  </span>
                </div>
              ) : (
                <div className="text-center py-4">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Select an order or create a new one</p>
                  <button onClick={() => setShowNewOrder(true)} className="mt-3 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm">
                    New Order
                  </button>
                </div>
              )}
            </div>

            {selectedOrder && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[400px]">
                  {orderItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Tap menu items to add them</p>
                  ) : (
                    orderItems.map((item) => {
                      const st = ITEM_STATUS_COLORS[item.status] || ITEM_STATUS_COLORS.pending;
                      return (
                        <div key={item.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{item.item_name}</p>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${st.bg} ${st.text}`}>{item.status}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">€{item.unit_price.toFixed(2)} each</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleUpdateQuantity(item, -1)} className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-sm font-bold text-foreground w-6 text-center">{item.quantity}</span>
                            <button onClick={() => handleUpdateQuantity(item, 1)} className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                              <Plus className="h-3 w-3" />
                            </button>
                            <span className="text-sm font-semibold text-foreground w-16 text-right">€{item.total_price.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Totals + actions */}
                <div className="border-t border-border p-4 space-y-3 bg-muted/30">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>€{selectedOrder.subtotal.toFixed(2)}</span>
                    </div>
                    {selectedOrder.discount_amount > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Discount</span>
                        <span>-€{selectedOrder.discount_amount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-foreground text-lg pt-1 border-t border-border">
                      <span>Total</span>
                      <span>€{selectedOrder.total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Receipt email/phone for bill */}
                  {!bill && ["submitted", "preparing", "served"].includes(selectedOrder.status) && (
                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="Receipt email"
                        value={receiptEmail}
                        onChange={(e) => setReceiptEmail(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs text-foreground"
                      />
                      <input
                        type="tel"
                        placeholder="Phone"
                        value={receiptPhone}
                        onChange={(e) => setReceiptPhone(e.target.value)}
                        className="w-28 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs text-foreground"
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    {selectedOrder.status === "open" && orderItems.length > 0 && (
                      <button onClick={handleSendToKitchen} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
                        <Send className="h-4 w-4" />
                        Send to Kitchen
                      </button>
                    )}
                    {["open", "submitted", "preparing", "served"].includes(selectedOrder.status) && !bill && (
                      <button onClick={handleGenerateBill} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium hover:bg-accent-dark transition-colors">
                        <Receipt className="h-4 w-4" />
                        Generate Bill
                      </button>
                    )}
                    {bill && bill.status !== "paid" && bill.status !== "refunded" && (
                      <button onClick={() => setShowPayment(true)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors">
                        <CreditCard className="h-4 w-4" />
                        Pay €{bill.total.toFixed(2)}
                      </button>
                    )}
                    {bill && bill.receipt_token && (
                      <button
                        onClick={() => window.open(`/receipt/${bill.receipt_token}`, "_blank")}
                        className="flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl bg-muted text-foreground text-sm hover:bg-muted/80"
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Active Orders Tab */}
      {activeTab === "orders" && (
        <div className="space-y-3">
          {activeOrders.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No active orders</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOrders.map((order) => {
                const sc = ORDER_STATUS_COLORS[order.status] || ORDER_STATUS_COLORS.open;
                return (
                  <div
                    key={order.id}
                    onClick={() => { loadOrder(order.id); setActiveTab("pos"); }}
                    className="glass-card p-4 hover:shadow-md hover:border-accent-DEFAULT/30 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-foreground">#{order.id}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>{order.status}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />{order.elapsed_minutes}m
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{order.table_number ? `Table ${order.table_number}` : order.order_type}</span>
                        <span className="text-muted-foreground">{order.item_count} items</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-foreground">€{order.total.toFixed(2)}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Daily Summary Tab */}
      {activeTab === "summary" && dailySummary && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />Revenue Overview
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Revenue</span>
                  <span className="text-2xl font-bold text-emerald-400">€{dailySummary.total_revenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total Tax</span>
                  <span className="text-foreground">€{dailySummary.total_tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total Tips</span>
                  <span className="text-foreground">€{dailySummary.total_tips.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total Discounts</span>
                  <span className="text-red-400">-€{dailySummary.total_discounts.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-blue-400" />Orders Overview
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Orders</span>
                  <span className="text-2xl font-bold text-blue-400">{dailySummary.total_orders}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Avg Order Value</span>
                  <span className="text-foreground">€{dailySummary.avg_order_value.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
          {Object.keys(dailySummary.payment_breakdown).length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-purple-400" />Payment Breakdown
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(dailySummary.payment_breakdown).map(([method, amount]) => (
                  <div key={method} className="bg-muted/50 rounded-xl p-4 text-center">
                    <p className="text-sm text-muted-foreground capitalize">{method}</p>
                    <p className="text-xl font-bold text-foreground mt-1">€{amount.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cash Shifts Tab (F5) */}
      {activeTab === "shifts" && (
        <div className="space-y-4">
          {/* Current shift status */}
          <div className="bg-card rounded-2xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Wallet className="h-5 w-5 text-emerald-400" />Current Shift
              </h3>
              {currentShift ? (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">Open</span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">Closed</span>
              )}
            </div>
            {currentShift ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Opening Amount</p>
                    <p className="text-lg font-bold text-foreground">€{currentShift.opening_amount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Opened At</p>
                    <p className="text-foreground">{new Date(currentShift.opened_at).toLocaleTimeString()}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCloseShift(true)}
                  className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600"
                >
                  Close Shift
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowOpenShift(true)}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"
              >
                Open Shift
              </button>
            )}
          </div>

          {/* Shift history */}
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <h3 className="font-bold text-foreground">Shift History</h3>
            {cashShifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shift records yet</p>
            ) : (
              <div className="space-y-3">
                {cashShifts.map((shift) => (
                  <div key={shift.id} className="bg-muted/30 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {new Date(shift.opened_at).toLocaleDateString()} {new Date(shift.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {shift.closed_at && ` — ${new Date(shift.closed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${shift.status === "open" ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                        {shift.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Opening</p>
                        <p className="font-medium text-foreground">€{shift.opening_amount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Closing</p>
                        <p className="font-medium text-foreground">{shift.closing_amount != null ? `€${shift.closing_amount.toFixed(2)}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Expected</p>
                        <p className="font-medium text-foreground">{shift.expected_amount != null ? `€${shift.expected_amount.toFixed(2)}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Variance</p>
                        <p className={`font-medium ${shift.variance != null && shift.variance < 0 ? "text-red-400" : shift.variance != null && shift.variance > 0 ? "text-emerald-400" : "text-foreground"}`}>
                          {shift.variance != null ? `€${shift.variance.toFixed(2)}` : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Order Modal */}
      {showNewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-accent-DEFAULT" />New Order
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Order Type</label>
                <div className="flex gap-2">
                  {["dine_in", "takeout", "delivery"].map((type) => (
                    <button key={type} onClick={() => setNewOrderType(type)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${newOrderType === type ? "bg-accent-DEFAULT text-white" : "bg-muted text-muted-foreground border border-border"}`}
                    >
                      {type === "dine_in" ? "Dine-in" : type === "takeout" ? "Takeout" : "Delivery"}
                    </button>
                  ))}
                </div>
              </div>
              {newOrderType === "dine_in" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Select Table</label>
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                    {tables.filter((t) => t.status === "occupied" || t.status === "available").map((t) => (
                      <button key={t.id} onClick={() => setNewOrderTableId(t.id)}
                        className={`p-3 rounded-xl text-center text-sm font-medium transition-all ${newOrderTableId === t.id ? "bg-accent-DEFAULT text-white ring-2 ring-accent-DEFAULT" : "bg-muted text-foreground border border-border hover:border-accent-DEFAULT/50"}`}
                      >
                        {t.table_number}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewOrder(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleCreateOrder} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Create Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Payment Modal (F5) */}
      {showPayment && bill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-accent-DEFAULT" />Process Payment
            </h2>
            <div className="bg-muted/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bill #{bill.bill_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>€{bill.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({(bill.tax_rate * 100).toFixed(0)}%)</span>
                <span>€{bill.tax_amount.toFixed(2)}</span>
              </div>
              {tipPercent > 0 && (
                <div className="flex justify-between text-sm text-cyan-400">
                  <span>Tip ({tipPercent}%)</span>
                  <span>€{(Math.round(bill.total * tipPercent) / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t border-border pt-2 mt-2">
                <span>Total</span>
                <span className="text-accent-DEFAULT">
                  €{(bill.total + Math.round(bill.total * tipPercent) / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Tip presets */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Add tip</p>
              <div className="flex gap-2">
                {[0, 10, 15, 20].map((pct) => (
                  <button key={pct} onClick={() => setTipPercent(pct)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${tipPercent === pct ? "bg-cyan-500 text-white" : "bg-muted text-muted-foreground border border-border"}`}
                  >
                    {pct === 0 ? "None" : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment method */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Payment method</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { method: "cash", label: "Cash", icon: Banknote, color: "bg-emerald-500" },
                  { method: "card", label: "Card", icon: CreditCard, color: "bg-blue-500" },
                  { method: "mobile", label: "Mobile Pay", icon: CircleDot, color: "bg-purple-500" },
                  { method: "voucher", label: "Voucher", icon: Gift, color: "bg-pink-500" },
                  { method: "split", label: "Split Bill", icon: Split, color: "bg-amber-500" },
                ].map((pm) => (
                  <button key={pm.method} onClick={() => setPaymentMethod(pm.method)}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${paymentMethod === pm.method ? `${pm.color} text-white ring-2 ring-offset-2 ring-offset-card` : "bg-muted text-muted-foreground border border-border"}`}
                  >
                    <pm.icon className="h-4 w-4" />{pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Voucher input */}
            {paymentMethod === "voucher" && (
              <div className="space-y-2">
                <input type="text" placeholder="Scan QR or Enter Voucher Code (e.g. GV-XXXX)" value={voucherCode} onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground uppercase placeholder:normal-case"
                />
                {voucherError && <p className="text-xs text-red-500 font-medium">{voucherError}</p>}
              </div>
            )}

            {/* Card details */}
            {paymentMethod === "card" && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input type="text" placeholder="Last 4 digits" maxLength={4} value={cardLastFour} onChange={(e) => setCardLastFour(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground"
                  />
                  <select value={cardBrand} onChange={(e) => setCardBrand(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground"
                  >
                    <option value="visa">Visa</option>
                    <option value="mastercard">Mastercard</option>
                    <option value="amex">Amex</option>
                  </select>
                </div>
              </div>
            )}

            {/* Wallet type */}
            {paymentMethod === "mobile" && (
              <div className="space-y-2">
                <select value={walletType} onChange={(e) => setWalletType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground"
                >
                  <option value="apple_pay">Apple Pay</option>
                  <option value="google_pay">Google Pay</option>
                  <option value="samsung_pay">Samsung Pay</option>
                </select>
              </div>
            )}

            {paymentMethod && (
              <button onClick={handlePayment}
                className="w-full py-3 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium hover:bg-accent-dark transition-colors"
              >
                <CheckCircle2 className="h-4 w-4 inline mr-2" />
                Confirm Payment €{(bill.total + Math.round(bill.total * tipPercent) / 100).toFixed(2)}
              </button>
            )}

            <button onClick={() => { setShowPayment(false); setPaymentMethod(null); setTipPercent(0); }}
              className="w-full px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Send Receipt Modal (F8) */}
      {showSendReceipt && bill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Mail className="h-5 w-5 text-accent-DEFAULT" />Send Digital Receipt
            </h2>
            <p className="text-sm text-muted-foreground">Payment successful! Send receipt to the guest?</p>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <input type="email" placeholder="Email address" value={receiptEmail} onChange={(e) => setReceiptEmail(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground"
                />
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <input type="tel" placeholder="Phone number" value={receiptPhone} onChange={(e) => setReceiptPhone(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground"
                />
              </div>
              {bill.receipt_token && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="h-3 w-3" />
                  <span className="truncate">Receipt link: /receipt/{bill.receipt_token.slice(0, 12)}...</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowSendReceipt(false); setBill(null); setSelectedOrder(null); setOrderItems([]); }}
                className="flex-1 px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-border"
              >
                Skip
              </button>
              <button onClick={handleSendReceipt}
                className="flex-1 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium"
              >
                Send Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Shift Modal */}
      {showOpenShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-foreground">Open Cash Shift</h2>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Opening Amount (€)</label>
              <input type="number" step="0.01" value={shiftAmount} onChange={(e) => setShiftAmount(e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowOpenShift(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground">Cancel</button>
              <button onClick={handleOpenShift} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium">Open Shift</button>
            </div>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {showCloseShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-foreground">Close Cash Shift</h2>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Closing Amount (€)</label>
              <input type="number" step="0.01" value={shiftAmount} onChange={(e) => setShiftAmount(e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCloseShift(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground">Cancel</button>
              <button onClick={handleCloseShift} className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium">Close Shift</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
