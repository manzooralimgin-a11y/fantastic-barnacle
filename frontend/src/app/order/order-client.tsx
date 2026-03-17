"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Send,
  Clock,
  AlertCircle,
  Check,
  Sparkles,
  ChevronDown,
  X,
  Leaf,
} from "lucide-react";

/* ── types ── */
interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  price: number;
  category_id: number;
  category_name: string;
  image_url: string | null;
  is_available: boolean;
  prep_time_min: number;
  allergens: string[];
  dietary_tags: string[];
}

interface MenuCategory {
  id: number;
  name: string;
  items: MenuItem[];
}

interface CartItem {
  item: MenuItem;
  quantity: number;
  notes: string;
}

interface OrderResponse {
  order_id: number;
  table_number: string;
  status: string;
  items_count: number;
  total: number;
  message: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api` : "/api";

const ALLERGEN_EMOJI: Record<string, string> = {
  gluten: "\u{1F33E}", wheat: "\u{1F33E}", dairy: "\u{1F95B}", milk: "\u{1F95B}",
  nuts: "\u{1F95C}", peanuts: "\u{1F95C}", eggs: "\u{1F95A}", fish: "\u{1F41F}",
  shellfish: "\u{1F990}", soy: "\u{1FAD8}", sesame: "\u{1FAD8}", celery: "\u{1F96C}",
  mustard: "\u{1F33F}", lupin: "\u{1F33B}", molluscs: "\u{1F419}", sulphites: "\u{1F377}",
};

export function OrderClient() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "";

  const [tableInfo, setTableInfo] = useState<{ table_number: string; section_name: string } | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderResult, setOrderResult] = useState<OrderResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/qr/menu/${code}`);
      if (!res.ok) throw new Error("Invalid QR code");
      const data = await res.json();
      setTableInfo(data.table);
      setCategories(data.categories);
      if (data.categories.length > 0) {
        setSelectedCat(data.categories[0].id);
      }
    } catch {
      setError("This QR code is invalid or has expired. Please ask your server for assistance.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  /* ── cart operations ── */
  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id);
      if (existing) {
        return prev.map((ci) =>
          ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prev, { item, quantity: 1, notes: "" }];
    });
  };

  const updateQuantity = (itemId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((ci) =>
          ci.item.id === itemId ? { ...ci, quantity: ci.quantity + delta } : ci
        )
        .filter((ci) => ci.quantity > 0)
    );
  };

  const removeFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
  };

  const cartTotal = cart.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0);
  const cartCount = cart.reduce((sum, ci) => sum + ci.quantity, 0);

  const getItemQty = (itemId: number) =>
    cart.find((ci) => ci.item.id === itemId)?.quantity ?? 0;

  /* ── submit order ── */
  const submitOrder = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/qr/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_code: code,
          guest_name: guestName || "Guest",
          items: cart.map((ci) => ({
            menu_item_id: ci.item.id,
            quantity: ci.quantity,
            notes: ci.notes || null,
          })),
          notes: orderNotes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      const data = await res.json();
      setOrderResult(data);
      setCart([]);
      setShowCart(false);
    } catch {
      alert("Failed to submit order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const currentItems = selectedCat
    ? categories.find((c) => c.id === selectedCat)?.items ?? []
    : categories.flatMap((c) => c.items);

  /* ── loading / error ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card px-6">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <p className="text-foreground/80 text-lg">{error}</p>
        </div>
      </div>
    );
  }

  /* ── order confirmed ── */
  if (orderResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Order Placed!</h1>
          <p className="text-muted-foreground mb-4">{orderResult.message}</p>
          <div className="bg-white/[0.03] rounded-2xl p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order #</span>
              <span className="font-semibold">{orderResult.order_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Items</span>
              <span className="font-semibold">{orderResult.items_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-emerald-600">&euro;{orderResult.total.toFixed(2)}</span>
            </div>
          </div>
          <button
            onClick={() => { setOrderResult(null); fetchMenu(); }}
            className="mt-6 w-full py-3 rounded-2xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-colors"
          >
            Order More
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-card pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-card border-b border-white/[0.06] px-4 py-3 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Gestronomy</h1>
            {tableInfo && (
              <p className="text-xs text-muted-foreground">
                Table {tableInfo.table_number} &middot; {tableInfo.section_name}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium"
          >
            <ShoppingCart className="h-4 w-4" />
            &euro;{cartTotal.toFixed(2)}
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Category Tabs ── */}
      <div className="sticky top-[57px] z-20 bg-card border-b border-white/[0.06]">
        <div className="max-w-lg mx-auto flex gap-1 px-4 py-2 overflow-x-auto scrollbar-thin">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedCat === cat.id
                ? "bg-emerald-500 text-white"
                : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.06]"
                }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Menu Items ── */}
      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {currentItems.map((item) => {
          const qty = getItemQty(item.id);
          return (
            <div
              key={item.id}
              className={`bg-card rounded-2xl border ${qty > 0 ? "border-emerald-300 shadow-sm" : "border-white/[0.06]"
                } p-4 transition-all`}
            >
              <div className="flex justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-base">{item.name}</h3>
                  {item.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-lg font-bold text-emerald-600">
                      &euro;{item.price.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground/60 flex items-center gap-0.5">
                      <Clock className="h-3 w-3" /> {item.prep_time_min}m
                    </span>
                  </div>
                  {/* allergens + dietary */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.dietary_tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs">
                        <Leaf className="h-3 w-3" /> {tag}
                      </span>
                    ))}
                    {item.allergens.map((a) => (
                      <span key={a} className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs" title={`Contains ${a}`}>
                        {ALLERGEN_EMOJI[a.toLowerCase()] || "\u26A0\uFE0F"} {a}
                      </span>
                    ))}
                  </div>
                </div>
                {/* add / qty controls */}
                <div className="flex-shrink-0 flex flex-col items-end justify-between">
                  {qty === 0 ? (
                    <button
                      onClick={() => addToCart(item)}
                      className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-emerald-50 rounded-xl px-1 py-1">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-8 h-8 rounded-lg bg-card shadow-sm flex items-center justify-center text-emerald-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center font-bold text-emerald-600 text-sm">{qty}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Floating Cart Button ── */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-4 bg-gradient-to-t from-white via-white to-transparent">
          <button
            onClick={() => setShowCart(true)}
            className="w-full max-w-lg mx-auto flex items-center justify-between px-6 py-4 rounded-2xl bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 transition-colors"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              View Cart ({cartCount} item{cartCount > 1 ? "s" : ""})
            </span>
            <span className="text-lg">&euro;{cartTotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* ── Cart Drawer ── */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowCart(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <h2 className="text-lg font-bold text-foreground">Your Order</h2>
              <button
                onClick={() => setShowCart(false)}
                className="p-2 rounded-lg hover:bg-white/[0.04]"
              >
                <X className="h-5 w-5 text-muted-foreground/60" />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="px-6 py-10 text-center text-muted-foreground/60">
                Your cart is empty
              </div>
            ) : (
              <div className="px-6 py-4 space-y-3">
                {cart.map((ci) => (
                  <div key={ci.item.id} className="flex items-center justify-between py-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">{ci.item.name}</p>
                      <p className="text-xs text-muted-foreground/60">
                        &euro;{ci.item.price.toFixed(2)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQuantity(ci.item.id, -1)}
                          className="w-7 h-7 rounded-lg border border-white/[0.08] flex items-center justify-center text-muted-foreground"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{ci.quantity}</span>
                        <button
                          onClick={() => updateQuantity(ci.item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-sm font-bold w-16 text-right">
                        &euro;{(ci.item.price * ci.quantity).toFixed(2)}
                      </span>
                      <button
                        onClick={() => removeFromCart(ci.item.id)}
                        className="p-1 text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* guest name */}
                <div className="pt-3 border-t border-white/[0.06]">
                  <label className="text-xs text-muted-foreground block mb-1">Your Name</label>
                  <input
                    type="text"
                    placeholder="Guest"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>

                {/* total + submit */}
                <div className="pt-3 border-t border-white/[0.06] space-y-3">
                  <div className="flex justify-between text-base font-bold">
                    <span>Total</span>
                    <span className="text-emerald-600">&euro;{cartTotal.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={submitOrder}
                    disabled={submitting}
                    className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-bold text-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        Place Order
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
