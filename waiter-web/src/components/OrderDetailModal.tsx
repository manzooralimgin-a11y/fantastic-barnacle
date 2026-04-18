import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  waiterApi,
  type BillRead,
  type ReceiptData,
  type TableOrderRead,
} from "../lib/api";
import { useAppStore } from "../lib/store";
import { Receipt } from "./Receipt";

interface Props {
  orderId: number;
  onClose: () => void;
}

export function OrderDetailModal({ orderId, onClose }: Props) {
  const [order, setOrder] = useState<TableOrderRead | null>(null);
  const [bill, setBill] = useState<BillRead | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [paid, setPaid] = useState(false);

  const refreshLiveOrders = useAppStore((s) => s.refreshLiveOrders);
  const refreshTables = useAppStore((s) => s.refreshTables);
  const waiterId = useAppStore((s) => s.waiterId);
  const waiterName = useAppStore((s) => s.waiterName);
  const logout = useAppStore((s) => s.logout);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, items, b] = await Promise.all([
        waiterApi.orderDetail(orderId),
        waiterApi.orderItems(orderId).catch(() => []),
        waiterApi.billByOrder(orderId).catch(() => null),
      ]);
      // Backend returns TableOrderRead without items eagerly loaded — merge.
      setOrder({ ...o, items });
      setBill(b);
      if (b) {
        try {
          const r = await waiterApi.receipt(b.id);
          setReceipt(r);
        } catch {
          /* receipt may not be reachable before payment */
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [orderId, logout]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePay = async () => {
    if (!order) return;
    const amount = bill ? bill.total : order.total;
    setPaying(true);
    setError(null);
    try {
      await waiterApi.payOrder({
        order_id: String(orderId),
        amount,
        payment_method: payMethod,
        waiter_id: waiterId,
      });
      setPaid(true);
      await Promise.all([refreshLiveOrders(), refreshTables()]);
      // Reload receipt now that it's paid
      if (bill) {
        try {
          const r = await waiterApi.receipt(bill.id);
          setReceipt(r);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  const print = () => {
    window.print();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div
          className="row"
          style={{ justifyContent: "space-between", marginBottom: "0.5rem" }}
        >
          <h3>Order #{orderId}</h3>
          <button className="sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && (
          <div
            className="row"
            style={{ padding: "2rem", justifyContent: "center" }}
          >
            <div className="spinner" />
          </div>
        )}

        {error && <div className="status err">{error}</div>}

        {order && !loading && (
          <div className="stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill blue">{order.status}</span>
              <span className="hint">
                Created {new Date(order.created_at).toLocaleString()}
              </span>
            </div>

            {order.items && order.items.length > 0 && (
              <div className="stack" style={{ gap: "0.35rem" }}>
                <h2>Items</h2>
                {order.items.map((item) => (
                  <div
                    key={item.id}
                      className="cart-row"
                      style={{ gridTemplateColumns: "1fr auto auto" }}
                  >
                    <div>
                      <div className="name">
                        {item.item_name ?? item.menu_item_name ?? `Item #${item.menu_item_id}`}
                      </div>
                      {item.notes ? (
                        <small className="hint">{item.notes}</small>
                      ) : null}
                    </div>
                    <span className="pill">{item.status}</span>
                    <div
                      className="line-total"
                      style={{ minWidth: 80, textAlign: "right" }}
                    >
                      ×{item.quantity} · €{item.total_price.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="totals">
              <div className="line">
                <span>Subtotal</span>
                <span>€{(bill?.subtotal ?? order.subtotal).toFixed(2)}</span>
              </div>
              <div className="line">
                <span>
                  Tax{" "}
                  {bill ? `(${(bill.tax_rate * 100).toFixed(0)}%)` : ""}
                </span>
                <span>
                  €{(bill?.tax_amount ?? order.tax_amount).toFixed(2)}
                </span>
              </div>
              {bill && bill.service_charge > 0 && (
                <div className="line">
                  <span>Service</span>
                  <span>€{bill.service_charge.toFixed(2)}</span>
                </div>
              )}
              {bill && bill.discount_amount > 0 && (
                <div className="line">
                  <span>Discount</span>
                  <span>−€{bill.discount_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="line grand">
                <span>Total</span>
                <span>€{(bill?.total ?? order.total).toFixed(2)}</span>
              </div>
              {bill && (
                <small className="hint">
                  Bill {bill.bill_number} · {bill.status}
                  {bill.paid_at
                    ? ` · paid ${new Date(bill.paid_at).toLocaleString()}`
                    : ""}
                </small>
              )}
            </div>

            {paid || bill?.status === "paid" ? (
              <div className="status ok">
                ✓ Paid. You can print the receipt now.
              </div>
            ) : (
              <>
                <label style={{ display: "grid", gap: 6 }}>
                  <small className="hint">Payment method</small>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="room_charge">Room charge</option>
                    <option value="voucher">Voucher</option>
                  </select>
                </label>
                <button
                  className="primary"
                  onClick={handlePay}
                  disabled={paying}
                >
                  {paying
                    ? "Processing…"
                    : `Take payment · €${(bill?.total ?? order.total).toFixed(
                        2
                      )}`}
                </button>
              </>
            )}

            <div className="row" style={{ justifyContent: "space-between" }}>
              <button onClick={print} disabled={!receipt && !bill && !order}>
                🖨 Print receipt
              </button>
              <button className="sm" onClick={load}>
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* Receipt mounted so window.print() can show it.
            CSS @media print makes only the receipt visible. */}
        <div style={{ marginTop: "1rem" }}>
          {order && (
            <Receipt
              order={order}
              bill={bill}
              receipt={receipt}
              waiterName={waiterName}
            />
          )}
        </div>
      </div>
    </div>
  );
}
