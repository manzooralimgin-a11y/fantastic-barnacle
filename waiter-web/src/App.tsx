import { useEffect, useRef, useState } from "react";
import { openWaiterWebSocket } from "./lib/api";
import { useAppStore } from "./lib/store";
import { LoginScreen } from "./components/LoginScreen";
import { TopBar } from "./components/TopBar";
import { PosScreen, type WorkspaceMode } from "./screens/PosScreen";

const POLL_MS = 20_000;

export default function App() {
  const authed = useAppStore((state) => state.authed);
  const loadReferenceData = useAppStore((state) => state.loadReferenceData);
  const refreshTables = useAppStore((state) => state.refreshTables);
  const refreshLiveOrders = useAppStore((state) => state.refreshLiveOrders);
  const refsLoaded = useAppStore((state) => state.refsLoaded);
  const refsError = useAppStore((state) => state.refsError);

  const [wsConnected, setWsConnected] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceMode>("order");

  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!authed) {
      return;
    }
    void loadReferenceData();
  }, [authed, loadReferenceData]);

  useEffect(() => {
    if (!authed) {
      return;
    }
    const tick = () => {
      void refreshTables();
      void refreshLiveOrders();
    };
    pollRef.current = window.setInterval(tick, POLL_MS);
    return () => {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
      }
      pollRef.current = null;
    };
  }, [authed, refreshLiveOrders, refreshTables]);

  useEffect(() => {
    if (!authed) {
      return;
    }
    const close = openWaiterWebSocket(
      (event) => {
        setWsConnected(true);
        if (typeof event.type === "string") {
          const normalized = event.type.toUpperCase();
          if (normalized.includes("ORDER")) {
            void refreshLiveOrders();
            void refreshTables();
          }
          if (normalized.includes("RESERVATION") || normalized.includes("TABLE")) {
            void refreshTables();
          }
        }
      },
      () => setWsConnected(false)
    );
    const settleTimer = window.setTimeout(() => {
      setWsConnected((current) => current || true);
    }, 5000);

    return () => {
      window.clearTimeout(settleTimer);
      close();
      setWsConnected(false);
    };
  }, [authed, refreshLiveOrders, refreshTables]);

  if (!authed) {
    return <LoginScreen />;
  }

  return (
    <div className="app-shell">
      <TopBar
        wsConnected={wsConnected}
        workspace={workspace}
        onWorkspaceChange={setWorkspace}
      />

      <main className="content">
        {!refsLoaded ? (
          <div className="loading-state">
            <div className="spinner" />
          </div>
        ) : null}

        {refsError ? (
          <div className="status err app-error">
            {refsError}
            <button className="sm" onClick={() => void loadReferenceData()}>
              Retry
            </button>
          </div>
        ) : null}

        {refsLoaded ? (
          <PosScreen workspace={workspace} onWorkspaceChange={setWorkspace} />
        ) : null}
      </main>
    </div>
  );
}
