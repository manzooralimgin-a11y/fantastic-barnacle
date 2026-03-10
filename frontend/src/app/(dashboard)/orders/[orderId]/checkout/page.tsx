"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Smartphone,
  Check,
  Printer,
  Mail,
  Phone,
  Gift,
  Sparkles,
  Receipt,
  Split,
} from "lucide-react";

/* ── Types ── */
interface OrderItemType {
  id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  modifiers_json: Record<string, unknown> | null;
  notes: string | null;
  status: string;
}

interface TableOrder {
  id: number;
  table_id: number | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  tip_amount: number;
  total: number;
  guest_name: string | null;
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
  tip_suggestions_json: { suggestions?: number[] } | null;
}

interface ReceiptData {
  bill_number: string;
  order_id: number;
  items: { item_name: string; quantity: number; unit_price: number; total_price: number; notes: string | null }[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  service_charge: number;
  discount_amount: number;
  tip_amount: number;
  total: number;
  payments: { amount: number; method: string; tip_amount: number; paid_at: string }[];
  paid_at: string | null;
  receipt_token: string | null;
}

/* ── Component ── */
export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = Number(params.orderId);

  const [order, setOrder] = useState<TableOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemType[]>([]);
  const [bill, setBill] = useState<BillType | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Payment state
  const [tipPercent, setTipPercent] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "wallet">("card");
  const [cardLastFour, setCardLastFour] = useState("");
  const [cardBrand, setCardBrand] = useState("visa");
  const [splitCount, setSplitCount] = useState(1);

  // Flow state
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState("");
  const [receiptPhone, setReceiptPhone] = useState("");
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);

  /* ── Load data ── */
  const loadData = useCallback(async () => {
    try {
      const [orderRes, itemsRes] = await Promise.all([
        api.get(`/billing/orders/${orderId}`),
        api.get(`/billing/orders/${orderId}/items`),
      ]);
      setOrder(orderRes.data);
      setOrderItems(itemsRes.data);

      // Generate bill
      try {
        const billRes = await api.post("/billing/bills", {
          order_id: orderId,
          tax_rate: 0.10,
        });
        setBill(billRes.data);
      } catch {
        // Bill may already exist — try to find it
        try {
          const existingBill = await api.get(`/billing/bills/by-order/${orderId}`);
          setBill(existingBill.data);
          if (existingBill.data.status === "paid") {
            setPaid(true);
            const receiptRes = await api.get(`/billing/bills/${existingBill.data.id}/receipt`);
            setReceiptData(receiptRes.data);
          }
        } catch { /* no bill yet */ }
      }
    } catch {
      /* handle */
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Computed ── */
  const subtotal = bill?.subtotal ?? order?.subtotal ?? 0;
  const taxAmount = bill?.tax_amount ?? order?.tax_amount ?? 0;
  const discountAmount = bill?.discount_amount ?? order?.discount_amount ?? 0;
  const serviceCharge = bill?.service_charge ?? 0;

  const tipAmount = tipPercent !== null
    ? subtotal * (tipPercent / 100)
    : customTip ? parseFloat(customTip) || 0
    : 0;

  const grandTotal = subtotal + taxAmount - discountAmount + serviceCharge + tipAmount;
  const perPerson = splitCount > 1 ? grandTotal / splitCount : grandTotal;

  /* ── Actions ── */
  const handlePay = async () => {
    if (!bill) return;
    setPaying(true);
    try {
      // Split if needed
      if (splitCount > 1) {
        await api.put(`/billing/bills/${bill.id}/split`, {
          split_type: "equal",
          split_count: splitCount,
        });
      }

      // Process payment
      await api.post("/billing/payments", {
        bill_id: bill.id,
        amount: grandTotal,
        method: paymentMethod,
        tip_amount: tipAmount,
        ...(paymentMethod === "card" && cardLastFour ? {
          card_last_four: cardLastFour,
          card_brand: cardBrand,
        } : {}),
      });

      // Fetch receipt
      try {
        const receiptRes = await api.get(`/billing/bills/${bill.id}/receipt`);
        setReceiptData(receiptRes.data);
      } catch { /* receipt endpoint might not return data for all bills */ }

      setPaid(true);
    } catch {
      /* handle */
    }
    setPaying(false);
  };

  const handleSendReceipt = async () => {
    if (!bill) return;
    setSendingReceipt(true);
    try {
      await api.post(`/billing/bills/${bill.id}/send-receipt`, {
        email: receiptEmail || undefined,
        phone: receiptPhone || undefined,
      });
      setReceiptSent(true);
    } catch { /* handle */ }
    setSendingReceipt(false);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Receipt className="h-12 w-12 mb-3 opacity-50" />
        <p>Order not found</p>
        <button onClick={() => router.push("/orders")} className="mt-4 text-orange-500 hover:underline text-sm">
          Back to Waiter Station
        </button>
      </div>
    );
  }

  /* ═══════════════════════════════════════
     PAID — SUCCESS STATE
     ═══════════════════════════════════════ */
  if (paid) {
    return (
      <>
        {/* Screen view */}
        <div className="max-w-lg mx-auto py-8 space-y-6 print:hidden">
          {/* Success header */}
          <div className="text-center space-y-3">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check className="h-8 w-8 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Payment Complete</h1>
            <p className="text-muted-foreground">
              {bill?.bill_number} &middot; &euro;{grandTotal.toFixed(2)}
            </p>
          </div>

          {/* Receipt preview */}
          <div className="bg-card rounded-2xl border border-border/50 p-6 space-y-4">
            <div className="text-center border-b border-border/50 pb-3">
              <h2 className="text-lg font-bold text-foreground">Gestronomy</h2>
              <p className="text-xs text-muted-foreground">Fine Dining Experience</p>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Bill: {bill?.bill_number}</span>
              <span>{new Date().toLocaleDateString()}</span>
            </div>

            <div className="space-y-2 border-t border-dashed border-border/50 pt-3">
              {orderItems.filter(i => i.status !== "cancelled").map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-foreground">
                    <span className="text-muted-foreground">{item.quantity}×</span> {item.item_name}
                  </span>
                  <span className="font-mono text-foreground">&euro;{item.total_price.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 border-t border-dashed border-border/50 pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono">&euro;{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="font-mono">&euro;{taxAmount.toFixed(2)}</span>
              </div>
              {tipAmount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tip</span>
                  <span className="font-mono">&euro;{tipAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-foreground text-base pt-1 border-t border-border/50">
                <span>Total</span>
                <span className="font-mono">&euro;{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground pt-2 border-t border-dashed border-border/50">
              Thank you for dining with us!
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handlePrint}
              className="w-full py-3 rounded-xl bg-foreground text-background font-semibold text-sm
                hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Print Receipt
            </button>

            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Email receipt..."
                value={receiptEmail}
                onChange={e => setReceiptEmail(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
              <button
                onClick={handleSendReceipt}
                disabled={sendingReceipt || (!receiptEmail && !receiptPhone)}
                className="px-4 py-2.5 rounded-xl bg-orange-500/10 text-orange-500 text-sm font-medium
                  hover:bg-orange-500/20 transition-colors disabled:opacity-50"
              >
                {receiptSent ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              </button>
            </div>

            <button
              onClick={() => router.push("/orders")}
              className="w-full py-3 rounded-xl border border-border bg-card text-foreground font-semibold text-sm
                hover:bg-muted active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              New Order
            </button>
          </div>
        </div>

        {/* Print-only receipt */}
        <div className="hidden print:block">
          <div className="max-w-[300px] mx-auto py-4 font-mono text-xs">
            <div className="text-center mb-4">
              <div className="text-lg font-bold">GESTRONOMY</div>
              <div className="text-[10px]">Fine Dining Experience</div>
              <div className="mt-2 text-[10px]">
                Bill: {bill?.bill_number}
              </div>
              <div className="text-[10px]">
                Date: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
              </div>
            </div>

            <div className="border-t border-dashed border-black my-2" />

            {orderItems.filter(i => i.status !== "cancelled").map(item => (
              <div key={item.id} className="flex justify-between py-0.5">
                <span>{item.quantity}x {item.item_name}</span>
                <span>&euro;{item.total_price.toFixed(2)}</span>
              </div>
            ))}

            <div className="border-t border-dashed border-black my-2" />

            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>&euro;{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>&euro;{taxAmount.toFixed(2)}</span>
            </div>
            {tipAmount > 0 && (
              <div className="flex justify-between">
                <span>Tip</span>
                <span>&euro;{tipAmount.toFixed(2)}</span>
              </div>
            )}

            <div className="border-t border-dashed border-black my-2" />

            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL</span>
              <span>&euro;{grandTotal.toFixed(2)}</span>
            </div>

            <div className="border-t border-dashed border-black my-2" />

            <div className="flex justify-between text-[10px]">
              <span>Payment</span>
              <span>{paymentMethod.toUpperCase()}</span>
            </div>

            <div className="text-center mt-6">
              <div>Thank you for dining with us!</div>
              <div className="mt-1 text-[10px]">gestronomy.app</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ═══════════════════════════════════════
     CHECKOUT — BILL & PAYMENT
     ═══════════════════════════════════════ */
  return (
    <div className="max-w-xl mx-auto py-6 space-y-6 print:hidden">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/orders")}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Checkout</h1>
          <p className="text-xs text-muted-foreground">
            Order #{orderId} {bill ? `· ${bill.bill_number}` : ""}
          </p>
        </div>
      </div>

      {/* Bill card */}
      <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
        {/* Restaurant header */}
        <div className="text-center py-5 bg-gradient-to-b from-orange-500/5 to-transparent border-b border-border/30">
          <h2 className="text-xl font-bold text-foreground tracking-wide">Gestronomy</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Fine Dining Experience</p>
        </div>

        {/* Meta */}
        <div className="px-5 py-3 flex justify-between text-xs text-muted-foreground border-b border-dashed border-border/30">
          <span>Table T{order.table_id || "—"}</span>
          <span>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
        </div>

        {/* Items */}
        <div className="px-5 py-4 space-y-2.5">
          {orderItems.filter(i => i.status !== "cancelled").map(item => (
            <div key={item.id}>
              <div className="flex justify-between">
                <span className="text-sm text-foreground">
                  <span className="text-muted-foreground">{item.quantity}×</span> {item.item_name}
                </span>
                <span className="font-mono text-sm text-foreground tabular-nums">
                  &euro;{item.total_price.toFixed(2)}
                </span>
              </div>
              {item.notes && (
                <p className="text-xs text-amber-500 italic ml-5 mt-0.5">{item.notes}</p>
              )}
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="px-5 py-4 border-t border-dashed border-border/30 space-y-1.5">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums">&euro;{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Tax ({((bill?.tax_rate ?? 0.10) * 100).toFixed(0)}%)</span>
            <span className="font-mono tabular-nums">&euro;{taxAmount.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-emerald-500">
              <span>Discount</span>
              <span className="font-mono tabular-nums">-&euro;{discountAmount.toFixed(2)}</span>
            </div>
          )}
          {serviceCharge > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Service charge</span>
              <span className="font-mono tabular-nums">&euro;{serviceCharge.toFixed(2)}</span>
            </div>
          )}
          {tipAmount > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tip</span>
              <span className="font-mono tabular-nums">&euro;{tipAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg text-foreground pt-2 border-t border-border/50">
            <span>Total</span>
            <span className="font-mono tabular-nums">&euro;{grandTotal.toFixed(2)}</span>
          </div>
          {splitCount > 1 && (
            <div className="flex justify-between text-sm text-orange-500">
              <span>Per person ({splitCount} ways)</span>
              <span className="font-mono tabular-nums">&euro;{perPerson.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tip selection */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Tip</h3>
        <div className="flex gap-2">
          {[0, 10, 15, 20].map(pct => (
            <button
              key={pct}
              onClick={() => { setTipPercent(pct); setCustomTip(""); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                ${tipPercent === pct
                  ? "bg-orange-500 text-white shadow-lg shadow-orange-500/25"
                  : "bg-card border border-border/50 text-muted-foreground hover:border-orange-500/30 hover:text-foreground"
                }`}
            >
              {pct === 0 ? "None" : `${pct}%`}
            </button>
          ))}
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="Custom"
              value={customTip}
              onChange={e => { setCustomTip(e.target.value); setTipPercent(null); }}
              className="w-full py-2.5 px-3 rounded-xl border border-border/50 bg-card text-sm text-center
                focus:outline-none focus:ring-2 focus:ring-orange-500/50 [appearance:textfield]
                [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">&euro;</span>
          </div>
        </div>
        {tipAmount > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Tip: &euro;{tipAmount.toFixed(2)}
          </p>
        )}
      </div>

      {/* Payment method */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Payment Method</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: "cash" as const, icon: Banknote, label: "Cash" },
            { key: "card" as const, icon: CreditCard, label: "Card" },
            { key: "wallet" as const, icon: Smartphone, label: "Mobile" },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setPaymentMethod(key)}
              className={`py-3 rounded-xl text-sm font-medium transition-all duration-200
                flex flex-col items-center gap-1.5
                ${paymentMethod === key
                  ? "bg-orange-500/10 border-2 border-orange-500/50 text-orange-500"
                  : "bg-card border border-border/50 text-muted-foreground hover:border-orange-500/20"
                }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>

        {paymentMethod === "card" && (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Last 4 digits"
              maxLength={4}
              value={cardLastFour}
              onChange={e => setCardLastFour(e.target.value.replace(/\D/g, ""))}
              className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-card text-sm
                focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
            <select
              value={cardBrand}
              onChange={e => setCardBrand(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm
                focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            >
              <option value="visa">Visa</option>
              <option value="mastercard">Mastercard</option>
              <option value="amex">Amex</option>
            </select>
          </div>
        )}
      </div>

      {/* Split bill */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Split className="h-4 w-4" /> Split Bill
        </h3>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(n => (
            <button
              key={n}
              onClick={() => setSplitCount(n)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                ${splitCount === n
                  ? "bg-orange-500 text-white shadow-lg shadow-orange-500/25"
                  : "bg-card border border-border/50 text-muted-foreground hover:border-orange-500/30"
                }`}
            >
              {n === 1 ? "No Split" : `${n} Ways`}
            </button>
          ))}
        </div>
      </div>

      {/* Pay button */}
      <button
        onClick={handlePay}
        disabled={paying}
        className="w-full py-4 rounded-2xl bg-orange-500 text-white font-bold text-lg
          hover:bg-orange-600 active:scale-[0.98] transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          shadow-xl shadow-orange-500/20
          flex items-center justify-center gap-2"
      >
        {paying ? (
          <>
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="h-5 w-5" />
            Pay &euro;{grandTotal.toFixed(2)}
            {splitCount > 1 && (
              <span className="text-sm font-normal opacity-80">
                (&euro;{perPerson.toFixed(2)} each)
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}
