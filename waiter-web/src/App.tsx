import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { openWaiterWebSocket } from "./lib/api";
import { useAppStore } from "./lib/store";
import { LoginScreen } from "./components/LoginScreen";
import { TopBar } from "./components/TopBar";
import { FloorScreen } from "./screens/FloorScreen";
import { MenuScreen } from "./screens/MenuScreen";
import { OrdersScreen } from "./screens/OrdersScreen";
import { ReservationsScreen } from "./screens/ReservationsScreen";

const POLL_MS = 20_000;

export default function App() {
  const authed = useAppStore((s) => s.authed);
  const loadReferenceData = useAppStore((s) => s.loadReferenceData);
  const refreshTables = useAppStore((s) => s.refreshTables);
  const refreshLiveOrders = useAppStore((s) => s.refreshLiveOrders);
  const refsLoaded = useAppStore((s) => s.refsLoaded);
  const refsError = useAppStore((s) => s.refsError);

  const [wsConnected, setWsConnected] = useState(false);

  const pollRef = useRef<number | null>(null);
  const wsCloseRef = useRef<(() => void) | null>(null);

  /* ---- bootstrap on login ---- */
  useEffect(() => {
    if (!authed) return;
    loadReferenceData();
  }, [authed, loadReferenceData]);

  /* ---- polling fallback ---- */
  useEffect(() => {
    if (!authed) return;
    const tick = () => {
      refreshTables();
      refreshLiveOrders();
    };
    pollRef.current = window.setInterval(tick, POLL_MS);
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [authed, refreshTables, refreshLiveOrders]);

  /* ---- websocket for live events ---- */
  useEffect(() => {
    if (!authed) return;
    const close = openWaiterWebSocket(
      (event) => {
        // Any server broadcast triggers a lightweight canonical re-fetch.
        setWsConnected(true);
        if (typeof event.type === "string") {
          if (
            event.type === "NEW_ORDER" ||
            event.type.toUpperCase().includes("ORDER")
          ) {
            refreshLiveOrders();
            refreshTables();
          }
          if (event.type.toUpperCase().includes("RESERVATION")) {
            refreshTables();
          }
        }
      },
      () => setWsConnected(false)
    );
    // Heuristic: if no message arrives in 5s, still consider WS live if the
    // close handler wasn't invoked.
    const settleTimer = window.setTimeout(() => setWsConnected((v) => v || true), 5000);
    wsCloseRef.current = close;
    return () => {
      window.clearTimeout(settleTimer);
      close();
      wsCloseRef.current = null;
      setWsConnected(false);
    };
  }, [authed, refreshLiveOrders, refreshTables]);

  if (!authed) {
    return <LoginScreen />;
  }

  return (
    <div className="app-shell">
      <TopBar wsConnected={wsConnected} />
      <div className="content">
        {!refsLoaded && (
          <div
            className="row"
            style={{ justifyContent: "center", padding: "3rem" }}
          >
            <div className="spinner" />
          </div>
        )}
        {refsError && (
          <div className="status err" style={{ marginBottom: "1rem" }}>
            {refsError} — <button className="sm" onClick={loadReferenceData}>Retry</button>
          </div>
        )}
        {refsLoaded && (
          <Routes>
            <Route path="/" element={<Navigate to="/floor" replace />} />
            <Route path="/floor" element={<FloorScreen />} />
            <Route path="/menu" element={<MenuScreen />} />
            <Route path="/orders" element={<OrdersScreen />} />
            <Route path="/reservations" element={<ReservationsScreen />} />
            <Route path="*" element={<Navigate to="/floor" replace />} />
          </Routes>
        )}
      </div>
    </div>
  );
}
