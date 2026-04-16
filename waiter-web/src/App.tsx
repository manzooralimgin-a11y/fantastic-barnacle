import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, authStore, waiterApi } from "./lib/api";
import type {
  WaiterMenuCategory,
  WaiterMenuItem,
  WaiterTable,
} from "./lib/api";
import { LoginScreen } from "./components/LoginScreen";
import { MenuBrowser } from "./components/MenuBrowser";
import { CartPanel } from "./components/CartPanel";
import { TableSelector } from "./components/TableSelector";

export interface CartLine {
  item: WaiterMenuItem;
  quantity: number;
  notes?: string;
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!authStore.getToken());
  const [waiterId, setWaiterId] = useState<string | null>(() =>
    authStore.getWaiterId()
  );

  const [tables, setTables] = useState<WaiterTable[]>([]);
  const [menu, setMenu] = useState<WaiterMenuCategory[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [refsError, setRefsError] = useState<string | null>(null);

  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  /* ---------------- login ---------------- */

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      const res = await waiterApi.login(username, password);
      authStore.set(res.access_token, res.refresh_token, res.waiter_id);
      setWaiterId(res.waiter_id);
      setAuthed(true);
    },
    []
  );

  const handleLogout = useCallback(() => {
    authStore.clear();
    setAuthed(false);
    setWaiterId(null);
    setTables([]);
    setMenu([]);
    setCart([]);
    setSelectedTableId("");
    setLastOrderId(null);
  }, []);

  /* ---------------- load reference data ---------------- */

  useEffect(() => {
    if (!authed) return;
    const ac = new AbortController();
    setLoadingRefs(true);
    setRefsError(null);
    Promise.all([
      waiterApi.tables(ac.signal),
      waiterApi.menu(ac.signal),
    ])
      .then(([t, m]) => {
        setTables(t);
        setMenu(m);
        if (!selectedTableId && t.length > 0) {
          setSelectedTableId(t[0].id);
        }
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          handleLogout();
          return;
        }
        setRefsError(
          err instanceof Error ? err.message : "Failed to load menu/tables"
        );
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingRefs(false);
      });
    return () => ac.abort();
  }, [authed, handleLogout, selectedTableId]);

  /* ---------------- cart ---------------- */

  const addToCart = useCallback((item: WaiterMenuItem) => {
    setCart((prev) => {
      const existing = prev.find((line) => line.item.id === item.id);
      if (existing) {
        return prev.map((line) =>
          line.item.id === item.id
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
    setLastOrderId(null);
    setSubmitError(null);
  }, []);

  const updateQty = useCallback((itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) =>
          line.item.id === itemId
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }, []);

  const removeLine = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((line) => line.item.id !== itemId));
  }, []);

  /* ---------------- submit order ---------------- */

  const submitOrder = useCallback(async () => {
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
      // eslint-disable-next-line no-console
      console.info("[waiter-web] order placed", res);
      setLastOrderId(res.order_id);
      setCart([]);
      setNotes("");
      // refresh tables to reflect new occupied state
      try {
        const t = await waiterApi.tables();
        setTables(t);
      } catch {
        /* ignore */
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleLogout();
        return;
      }
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit order"
      );
    } finally {
      setSubmitting(false);
    }
  }, [cart, handleLogout, notes, selectedTableId, waiterId]);

  /* ---------------- derived ---------------- */

  const allItems = useMemo<WaiterMenuItem[]>(() => {
    const out: WaiterMenuItem[] = [];
    for (const cat of menu)
      for (const sub of cat.subcategories) out.push(...sub.items);
    return out;
  }, [menu]);

  /* ---------------- render ---------------- */

  if (!authed) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="brand">das elb · Waiter</div>
          <div className="muted">
            Waiter ID: {waiterId ?? "?"} · {allItems.length} menu items
          </div>
        </div>
        <button onClick={handleLogout}>Log out</button>
      </header>

      <main className="layout">
        <section className="panel" style={{ minHeight: 0 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Menu</h2>
            <TableSelector
              tables={tables}
              value={selectedTableId}
              onChange={setSelectedTableId}
            />
          </div>

          {loadingRefs && <div className="status muted">Loading menu…</div>}
          {refsError && <div className="status err">{refsError}</div>}
          {!loadingRefs && !refsError && (
            <MenuBrowser menu={menu} onAdd={addToCart} />
          )}
        </section>

        <aside className="panel cart-panel">
          <h2>Order</h2>
          <CartPanel
            cart={cart}
            onDec={(id) => updateQty(id, -1)}
            onInc={(id) => updateQty(id, +1)}
            onRemove={removeLine}
          />
          <label style={{ display: "grid", gap: 4 }}>
            <small className="hint">Notes for kitchen (optional)</small>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. no onions on table 5"
            />
          </label>

          {submitError && <div className="status err">{submitError}</div>}
          {lastOrderId && (
            <div className="status ok">
              ✓ Order #{lastOrderId} sent to kitchen.
            </div>
          )}

          <button
            className="primary"
            onClick={submitOrder}
            disabled={submitting || cart.length === 0 || !selectedTableId}
          >
            {submitting ? "Sending…" : "Send to kitchen"}
          </button>
        </aside>
      </main>
    </div>
  );
}
