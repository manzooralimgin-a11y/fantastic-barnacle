import { useState } from "react";
import { useAppStore } from "../lib/store";
import { OrderDetailModal } from "../components/OrderDetailModal";

export function OrdersScreen() {
  const liveOrders = useAppStore((s) => s.liveOrders);
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);

  if (liveOrders.length === 0) {
    return (
      <div className="panel">
        <h2>Open orders</h2>
        <div className="empty">
          No open orders right now. Take an order from the Tables tab.
        </div>
      </div>
    );
  }

  const sorted = [...liveOrders].sort(
    (a, b) => b.elapsed_minutes - a.elapsed_minutes
  );

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Open orders · {liveOrders.length}</h2>
        <span className="hint">Tap an order to see items, pay or print.</span>
      </div>

      <div className="orders-list">
        {sorted.map((o) => {
          const warnClass =
            o.elapsed_minutes >= 30
              ? "err"
              : o.elapsed_minutes >= 15
                ? "warn"
                : "ok";
          return (
            <button
              key={o.id}
              className="order-card"
              onClick={() => setOpenOrderId(o.id)}
            >
              <div className="head">
                <span className="big">
                  {o.table_number ? `T${o.table_number}` : "Takeaway"}
                </span>
                <span className={`pill ${warnClass}`}>
                  {o.elapsed_minutes}m
                </span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="hint">Order #{o.id}</span>
                <span className="hint">{o.item_count} items</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="pill blue">{o.status}</span>
                <span style={{ color: "var(--gold)", fontWeight: 700 }}>
                  €{o.total.toFixed(2)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {openOrderId != null && (
        <OrderDetailModal
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
        />
      )}
    </div>
  );
}
