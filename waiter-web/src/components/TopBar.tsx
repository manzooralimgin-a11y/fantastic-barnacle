import { useMemo } from "react";
import { useAppStore } from "../lib/store";
import type { WorkspaceMode } from "../screens/PosScreen";

interface Props {
  wsConnected: boolean;
  workspace: WorkspaceMode;
  onWorkspaceChange: (workspace: WorkspaceMode) => void;
}

export function TopBar({ wsConnected, workspace, onWorkspaceChange }: Props) {
  const waiterName = useAppStore((state) => state.waiterName);
  const liveOrders = useAppStore((state) => state.liveOrders);
  const tables = useAppStore((state) => state.tables);
  const selectedTableId = useAppStore((state) => state.selectedTableId);
  const logout = useAppStore((state) => state.logout);

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId) ?? null,
    [selectedTableId, tables]
  );
  const activeTables = tables.filter((table) => table.status !== "free").length;

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <img className="logo" src="/das-elb-logo.png" alt="Das Elb" />
        <div>
          <strong>DAS ELB POS</strong>
          <span>
            {waiterName ?? "POS Staff"} · {activeTables}/{tables.length} tables active
          </span>
        </div>
      </div>

      <div className="topbar__nav">
        <button
          className={workspace === "order" ? "is-active" : ""}
          onClick={() => onWorkspaceChange("order")}
        >
          Order
        </button>
        <button
          className={workspace === "orders" ? "is-active" : ""}
          onClick={() => onWorkspaceChange("orders")}
        >
          Open Orders
          {liveOrders.length > 0 ? <span>{liveOrders.length}</span> : null}
        </button>
        <button
          className={workspace === "reservations" ? "is-active" : ""}
          onClick={() => onWorkspaceChange("reservations")}
        >
          Reservations
        </button>
      </div>

      <div className="topbar__meta">
        <div className="live-pill">
          <span className={`ws-dot ${wsConnected ? "on" : "off"}`} />
          <span>{wsConnected ? "Live sync" : "Polling"}</span>
        </div>
        <div className="selected-pill">
          {selectedTable ? `Table ${selectedTable.number}` : "No table selected"}
        </div>
        <button className="ghost sm" onClick={logout}>
          Log out
        </button>
      </div>
    </header>
  );
}
