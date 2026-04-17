import { useNavigate } from "react-router-dom";
import { useAppStore } from "../lib/store";
import type { WaiterTable } from "../lib/api";

function statusLabel(status: string): string {
  if (status === "free") return "Free";
  if (status === "occupied") return "Occupied";
  if (status === "reserved") return "Reserved";
  return status;
}

export function FloorScreen() {
  const tables = useAppStore((s) => s.tables);
  const liveOrders = useAppStore((s) => s.liveOrders);
  const selectTable = useAppStore((s) => s.selectTable);
  const selectedTableId = useAppStore((s) => s.selectedTableId);
  const navigate = useNavigate();

  const orderByTable = new Map<number, (typeof liveOrders)[number]>();
  for (const o of liveOrders) {
    if (o.table_id != null) orderByTable.set(o.table_id, o);
  }

  // Table numbers look like "5", "21/4", "1000", circles like "1"–"5".
  // Natural sort keeps 21/1…21/4 grouped.
  const sorted = [...tables].sort((a, b) =>
    a.number.localeCompare(b.number, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

  const tap = (t: WaiterTable) => {
    selectTable(t.id);
    navigate("/menu");
  };

  if (tables.length === 0) {
    return (
      <div className="panel">
        <h2>Floor</h2>
        <div className="empty">
          No tables found. Ask management to configure the dining room.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Floor · {tables.length} tables</h2>
        <div className="row" style={{ gap: "0.75rem" }}>
          <span className="pill ok">
            <span className="dot" /> Free {tables.filter((t) => t.status === "free").length}
          </span>
          <span className="pill blue">
            Occupied {tables.filter((t) => t.status === "occupied").length}
          </span>
          <span className="pill warn">
            Reserved {tables.filter((t) => t.status === "reserved").length}
          </span>
        </div>
      </div>

      <div className="floor-grid">
        {sorted.map((t) => {
          const order = orderByTable.get(Number(t.id));
          const cls = `table-card ${t.status} ${
            selectedTableId === t.id ? "selected" : ""
          }`;
          return (
            <button key={t.id} className={cls} onClick={() => tap(t)}>
              <span className="corner">
                <span className={`dot ${t.status}`} />
              </span>
              <span className="num">T{t.number}</span>
              <span className="seats">{t.seats} seats</span>
              <span className="pill" style={{ alignSelf: "flex-start" }}>
                {statusLabel(t.status)}
              </span>
              {order ? (
                <div
                  className="row"
                  style={{ justifyContent: "space-between", marginTop: "auto" }}
                >
                  <span className="hint">
                    {order.item_count} items · {order.elapsed_minutes}m
                  </span>
                  <span
                    style={{ color: "var(--gold)", fontWeight: 700 }}
                  >
                    €{order.total.toFixed(2)}
                  </span>
                </div>
              ) : t.status === "free" ? (
                <span className="hint" style={{ marginTop: "auto" }}>
                  Tap to take order
                </span>
              ) : (
                <span className="hint" style={{ marginTop: "auto" }}>
                  Tap to open
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
