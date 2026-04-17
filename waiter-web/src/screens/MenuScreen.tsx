import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../lib/store";
import { ApiError, waiterApi } from "../lib/api";

const TAX_HINT = 0.07; // client-side hint only; server is source of truth when bill is created

export function MenuScreen() {
  const menu = useAppStore((s) => s.menu);
  const tables = useAppStore((s) => s.tables);
  const selectedTableId = useAppStore((s) => s.selectedTableId);
  const selectTable = useAppStore((s) => s.selectTable);
  const carts = useAppStore((s) => s.carts);
  const orderNotes = useAppStore((s) => s.orderNotes);
  const addToCart = useAppStore((s) => s.addToCart);
  const updateCartQty = useAppStore((s) => s.updateCartQty);
  const removeCartLine = useAppStore((s) => s.removeCartLine);
  const clearCart = useAppStore((s) => s.clearCart);
  const setOrderNotes = useAppStore((s) => s.setOrderNotes);
  const refreshTables = useAppStore((s) => s.refreshTables);
  const refreshLiveOrders = useAppStore((s) => s.refreshLiveOrders);
  const waiterId = useAppStore((s) => s.waiterId);
  const logout = useAppStore((s) => s.logout);

  const navigate = useNavigate();

  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    menu[0]?.id ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const cart = selectedTableId ? carts[selectedTableId] ?? [] : [];
  const notes = selectedTableId ? orderNotes[selectedTableId] ?? "" : "";
  const activeTable = tables.find((t) => t.id === selectedTableId) ?? null;

  const activeCategory = useMemo(() => {
    if (!menu.length) return null;
    return menu.find((c) => c.id === activeCategoryId) ?? menu[0];
  }, [menu, activeCategoryId]);

  const visibleItems = useMemo(() => {
    if (!activeCategory) return [];
    const items = activeCategory.subcategories.flatMap((sub) => sub.items);
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
    );
  }, [activeCategory, search]);

  const subtotal = cart.reduce(
    (sum, line) => sum + line.item.price * line.quantity,
    0
  );
  const tax = subtotal * TAX_HINT;
  const total = subtotal + tax;

  const submit = async () => {
    if (!selectedTableId) {
      setSubmitError("Select a table first.");
      return;
    }
    if (cart.length === 0) {
      setSubmitError("Cart is empty.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setLastOrderId(null);
    try {
      const res = await waiterApi.createOrder({
        table_id: selectedTableId,
        waiter_id: waiterId,
        items: cart.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
          notes: line.notes ?? null,
        })),
        notes: notes.trim() || null,
      });
      setLastOrderId(res.order_id);
      clearCart(selectedTableId);
      // Refresh canonical state from backend
      await Promise.all([refreshTables(), refreshLiveOrders()]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit order"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedTableId) {
    return (
      <div className="panel">
        <h2>Select a table first</h2>
        <p className="hint">
          Pick a table from the Tables tab to start a new order, or choose
          below.
        </p>
        <div style={{ display: "grid", gap: "0.5rem", maxWidth: 360 }}>
          <select
            value=""
            onChange={(e) => selectTable(e.target.value)}
            aria-label="Choose table"
          >
            <option value="" disabled>
              Choose a table…
            </option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                T{t.number} · {t.seats} seats · {t.status}
              </option>
            ))}
          </select>
          <button className="primary" onClick={() => navigate("/floor")}>
            Go to floor view
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="menu-layout">
      {/* ---------------- Menu side ---------------- */}
      <section className="panel" style={{ minHeight: 0 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>
            Menu · Table T{activeTable?.number} ({activeTable?.seats} seats)
          </h2>
          <button className="sm" onClick={() => navigate("/floor")}>
            Switch table
          </button>
        </div>

        <input
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="category-bar">
          {menu.map((cat) => (
            <button
              key={cat.id}
              className={`category-chip ${
                cat.id === (activeCategory?.id ?? "") ? "active" : ""
              }`}
              onClick={() => setActiveCategoryId(cat.id)}
            >
              {cat.emoji ? `${cat.emoji} ` : ""}
              {cat.name}
            </button>
          ))}
        </div>

        {visibleItems.length === 0 ? (
          <div className="empty">No items in this category.</div>
        ) : (
          <div className="menu-grid">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                className="menu-item"
                disabled={!item.is_available}
                onClick={() => addToCart(item)}
                title={item.is_available ? "Add to order" : "Unavailable"}
              >
                <div className="name">
                  {item.emoji ? <span>{item.emoji}</span> : null}
                  <span style={{ flex: 1 }}>{item.name}</span>
                  <span className="price">€{item.price.toFixed(2)}</span>
                </div>
                {item.description ? (
                  <div className="desc">{item.description}</div>
                ) : null}
                <div className="row" style={{ gap: "0.3rem" }}>
                  {item.is_popular ? <span className="pill">Popular</span> : null}
                  {!item.is_available ? (
                    <span className="pill err">86'd</span>
                  ) : null}
                  {item.allergens.slice(0, 2).map((a) => (
                    <span className="pill" key={a}>
                      {a}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Cart side ---------------- */}
      <aside className="panel cart-panel">
        <div className="head">
          <h2>Current order</h2>
          <span className="hint">
            {cart.reduce((n, l) => n + l.quantity, 0)} items
          </span>
        </div>

        {cart.length === 0 ? (
          <div className="cart-empty">
            Tap menu items to add them to this order.
          </div>
        ) : (
          <div className="cart-list">
            {cart.map((line) => (
              <div key={line.item.id} className="cart-row">
                <div>
                  <div className="name">
                    {line.item.emoji ? `${line.item.emoji} ` : ""}
                    {line.item.name}
                  </div>
                  <button
                    className="remove"
                    onClick={() =>
                      removeCartLine(selectedTableId, line.item.id)
                    }
                  >
                    remove
                  </button>
                </div>
                <div className="qty">
                  <button
                    onClick={() =>
                      updateCartQty(selectedTableId, line.item.id, -1)
                    }
                  >
                    −
                  </button>
                  <span
                    style={{
                      minWidth: 22,
                      textAlign: "center",
                      fontWeight: 700,
                    }}
                  >
                    {line.quantity}
                  </span>
                  <button
                    onClick={() =>
                      updateCartQty(selectedTableId, line.item.id, +1)
                    }
                  >
                    +
                  </button>
                </div>
                <div />
                <div className="line-total">
                  €{(line.item.price * line.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}

        <label style={{ display: "grid", gap: 6 }}>
          <small className="hint">Notes for kitchen (optional)</small>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setOrderNotes(selectedTableId, e.target.value)}
            placeholder="e.g. allergy note, timing, seating"
          />
        </label>

        {cart.length > 0 && (
          <div className="totals">
            <div className="line">
              <span>Subtotal</span>
              <span>€{subtotal.toFixed(2)}</span>
            </div>
            <div className="line">
              <span>Tax ({(TAX_HINT * 100).toFixed(0)}%)</span>
              <span>€{tax.toFixed(2)}</span>
            </div>
            <div className="line grand">
              <span>Total</span>
              <span>€{total.toFixed(2)}</span>
            </div>
            <small className="hint">
              Final totals are confirmed by the backend when sent.
            </small>
          </div>
        )}

        {submitError && <div className="status err">{submitError}</div>}
        {lastOrderId && (
          <div className="status ok">
            ✓ Order #{lastOrderId} sent to the kitchen.
            <div style={{ marginTop: "0.5rem" }}>
              <button className="sm" onClick={() => navigate("/orders")}>
                View open orders →
              </button>
            </div>
          </div>
        )}

        <button
          className="primary"
          onClick={submit}
          disabled={submitting || cart.length === 0}
        >
          {submitting ? "Sending…" : "Send to kitchen"}
        </button>
      </aside>
    </div>
  );
}
