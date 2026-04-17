import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  waiterApi,
  type ReservationRead,
  type WaiterTable,
} from "../lib/api";
import { useAppStore } from "../lib/store";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTime(t: string): string {
  // "19:30:00" → "19:30"
  return t.slice(0, 5);
}

export function ReservationsScreen() {
  const tables = useAppStore((s) => s.tables);
  const logout = useAppStore((s) => s.logout);
  const refreshTables = useAppStore((s) => s.refreshTables);

  const [date, setDate] = useState<string>(todayIso());
  const [list, setList] = useState<ReservationRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [resDate, setResDate] = useState<string>(todayIso());
  const [resTime, setResTime] = useState("19:00");
  const [duration, setDuration] = useState(90);
  const [tableId, setTableId] = useState<string>("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await waiterApi.reservations(date);
      // Filter to restaurant reservations when the API mixes kinds
      setList(
        res.filter(
          (r) => !r.kind || r.kind === "restaurant" || r.kind === undefined
        )
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(
        err instanceof Error ? err.message : "Failed to load reservations"
      );
    } finally {
      setLoading(false);
    }
  }, [date, logout]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || partySize < 1) return;
    setCreating(true);
    setCreateError(null);
    setCreateOk(null);
    try {
      const created = await waiterApi.createReservation({
        guest_name: guestName.trim(),
        guest_phone: guestPhone.trim() || null,
        party_size: partySize,
        reservation_date: resDate,
        start_time: resTime.length === 5 ? `${resTime}:00` : resTime,
        duration_min: duration,
        table_id: tableId ? Number(tableId) : null,
        special_requests: specialRequests.trim() || null,
        source: "waiter",
      });
      setCreateOk(`Reservation #${created.id} confirmed for ${guestName}.`);
      setGuestName("");
      setGuestPhone("");
      setSpecialRequests("");
      setPartySize(2);
      setTableId("");
      await Promise.all([load(), refreshTables()]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setCreateError(
        err instanceof Error ? err.message : "Failed to create reservation"
      );
    } finally {
      setCreating(false);
    }
  };

  const seat = async (id: number) => {
    try {
      await waiterApi.seatReservation(id);
      await Promise.all([load(), refreshTables()]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else setError(err instanceof Error ? err.message : "Failed to seat");
    }
  };

  const cancel = async (id: number) => {
    if (!confirm("Cancel this reservation?")) return;
    try {
      await waiterApi.cancelReservation(id);
      await Promise.all([load(), refreshTables()]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else setError(err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  const availableTables = tables.filter(
    (t: WaiterTable) => t.status !== "occupied"
  );

  return (
    <div className="reservations-grid">
      {/* ------ Create form ------ */}
      <section className="panel">
        <h2>New reservation</h2>
        <form className="stack" onSubmit={submit}>
          <label style={{ display: "grid", gap: 6 }}>
            <small className="hint">Guest name *</small>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <small className="hint">Phone</small>
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              inputMode="tel"
              autoComplete="off"
            />
          </label>
          <div
            className="row"
            style={{ gap: "0.6rem", display: "grid", gridTemplateColumns: "1fr 1fr" }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <small className="hint">Party size *</small>
              <input
                type="number"
                min={1}
                max={30}
                value={partySize}
                onChange={(e) => setPartySize(Number(e.target.value))}
                required
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <small className="hint">Duration (min)</small>
              <input
                type="number"
                min={30}
                max={360}
                step={15}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
          </div>
          <div
            className="row"
            style={{ gap: "0.6rem", display: "grid", gridTemplateColumns: "1fr 1fr" }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <small className="hint">Date *</small>
              <input
                type="date"
                value={resDate}
                onChange={(e) => setResDate(e.target.value)}
                required
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <small className="hint">Time *</small>
              <input
                type="time"
                value={resTime}
                onChange={(e) => setResTime(e.target.value)}
                required
              />
            </label>
          </div>
          <label style={{ display: "grid", gap: 6 }}>
            <small className="hint">Table (optional)</small>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
            >
              <option value="">— Any available —</option>
              {availableTables.map((t) => (
                <option key={t.id} value={t.id}>
                  T{t.number} · {t.seats} seats
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <small className="hint">Special requests</small>
            <textarea
              rows={2}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              placeholder="e.g. window seat, birthday, high chair"
            />
          </label>
          {createError && <div className="status err">{createError}</div>}
          {createOk && <div className="status ok">{createOk}</div>}
          <button className="primary" type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create reservation"}
          </button>
        </form>
      </section>

      {/* ------ List ------ */}
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Reservations</h2>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: "auto" }}
          />
        </div>

        {loading && <div className="hint">Loading…</div>}
        {error && <div className="status err">{error}</div>}

        {!loading && list.length === 0 ? (
          <div className="empty">No reservations for {date}.</div>
        ) : (
          <div className="res-list">
            {list
              .slice()
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((r) => (
                <div key={r.id} className="res-card">
                  <div
                    className="row"
                    style={{ justifyContent: "space-between" }}
                  >
                    <span className="when">{fmtTime(r.start_time)}</span>
                    <span className={`pill ${r.status === "cancelled" ? "err" : r.status === "seated" ? "ok" : "blue"}`}>
                      {r.status}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700 }}>{r.guest_name}</div>
                  <div className="hint">
                    {r.party_size} guests · {r.duration_min} min
                    {r.table_id
                      ? ` · T${
                          tables.find((t) => Number(t.id) === r.table_id)
                            ?.number ?? r.table_id
                        }`
                      : ""}
                  </div>
                  {r.special_requests ? (
                    <small className="hint">"{r.special_requests}"</small>
                  ) : null}
                  <div className="row" style={{ gap: "0.4rem" }}>
                    {r.status !== "seated" && r.status !== "cancelled" ? (
                      <button
                        className="sm primary"
                        onClick={() => seat(r.id)}
                      >
                        Seat
                      </button>
                    ) : null}
                    {r.status !== "cancelled" ? (
                      <button
                        className="sm danger"
                        onClick={() => cancel(r.id)}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
