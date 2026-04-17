import { NavLink } from "react-router-dom";
import { useAppStore } from "../lib/store";

interface Props {
  wsConnected: boolean;
}

export function TopBar({ wsConnected }: Props) {
  const waiterName = useAppStore((s) => s.waiterName);
  const liveOrders = useAppStore((s) => s.liveOrders);
  const tables = useAppStore((s) => s.tables);
  const logout = useAppStore((s) => s.logout);

  const occupiedCount = tables.filter((t) => t.status !== "free").length;

  return (
    <>
      <header className="topbar">
        <div className="left">
          <img className="logo" src="/das-elb-logo.png" alt="Das Elb" />
          <div className="brand">
            <span className="title">DAS ELB · WAITER</span>
            <span className="sub">
              Signed in as {waiterName ?? "staff"} · {occupiedCount}/
              {tables.length} tables active
            </span>
          </div>
        </div>
        <div className="right">
          <span
            className={`ws-dot ${wsConnected ? "on" : "off"}`}
            title={wsConnected ? "Live updates on" : "Live updates off"}
          />
          <span className="hint" style={{ fontSize: "0.8rem" }}>
            {wsConnected ? "Live" : "Polling"}
          </span>
          <button className="sm" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <nav className="tabs">
        <NavLink
          to="/floor"
          className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
        >
          Tables
        </NavLink>
        <NavLink
          to="/menu"
          className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
        >
          Menu · Order
        </NavLink>
        <NavLink
          to="/orders"
          className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
        >
          Open orders
          {liveOrders.length > 0 ? (
            <span className="badge">{liveOrders.length}</span>
          ) : null}
        </NavLink>
        <NavLink
          to="/reservations"
          className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
        >
          Reservations
        </NavLink>
      </nav>
    </>
  );
}
