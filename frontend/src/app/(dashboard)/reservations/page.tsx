"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import {
  CalendarDays,
  Clock,
  Users,
  Plus,
  Phone,
  UserCheck,
  XCircle,
  CheckCircle2,
  Timer,
  Armchair,
  ChevronLeft,
  ChevronRight,
  MapPin,
  AlertCircle,
  X,
} from "lucide-react";
import { AuditTimeline } from "@/components/dashboard/audit-timeline";
import { useWebSocket } from "@/lib/websocket";

/* ── types ── */
interface FloorSection {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

interface TableItem {
  id: number;
  section_id: number;
  table_number: string;
  capacity: number;
  min_capacity: number;
  shape: string;
  status: string;
  position_x: number;
  position_y: number;
  rotation: number;
  width: number;
  height: number;
  is_active: boolean;
}

interface Reservation {
  id: number;
  guest_id: number | null;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  table_id: number | null;
  party_size: number;
  reservation_date: string;
  start_time: string;
  end_time: string | null;
  duration_min: number;
  status: string;
  special_requests: string | null;
  notes: string | null;
  source: string;
}

interface WaitlistEntry {
  id: number;
  guest_name: string;
  guest_phone: string | null;
  party_size: number;
  estimated_wait_min: number;
  status: string;
  check_in_time: string | null;
  notes: string | null;
}

interface FloorSummary {
  available: number;
  occupied: number;
  reserved: number;
  cleaning: number;
  blocked: number;
  total: number;
}

/* ── helpers ── */
const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  available: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  occupied: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
  reserved: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400" },
  cleaning: { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-400" },
  blocked: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
};

const RES_STATUS: Record<string, { bg: string; text: string; dot: string }> = {
  confirmed: { bg: "bg-emerald-500/10", text: "text-emerald-600", dot: "bg-emerald-500" },
  seated: { bg: "bg-blue-500/10", text: "text-blue-600", dot: "bg-blue-500" },
  completed: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  cancelled: { bg: "bg-red-500/10", text: "text-red-600", dot: "bg-red-500" },
  no_show: { bg: "bg-amber-500/10", text: "text-amber-600", dot: "bg-amber-500" },
};

const TABLE_SHAPES: Record<string, string> = {
  square: "rounded-lg",
  round: "rounded-full",
  rectangle: "rounded-lg",
};

function formatTime(t: string) {
  return t.slice(0, 5);
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === tomorrow.getTime()) return "Tomorrow";

  return d.toLocaleDateString("en-US", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ── Calendar Component ── */
function MiniCalendar({
  selectedDate,
  onSelect,
  reservationDates,
}: {
  selectedDate: string;
  onSelect: (d: string) => void;
  reservationDates?: Set<string>;
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(selectedDate + "T00:00:00");
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewMonth.year, viewMonth.month, 1).getDay();
  // Adjust so Monday = 0
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const today = todayStr();

  const prevMonth = () => {
    setViewMonth((v) => {
      if (v.month === 0) return { year: v.year - 1, month: 11 };
      return { ...v, month: v.month - 1 };
    });
  };

  const nextMonth = () => {
    setViewMonth((v) => {
      if (v.month === 11) return { year: v.year + 1, month: 0 };
      return { ...v, month: v.month + 1 };
    });
  };

  const monthLabel = new Date(viewMonth.year, viewMonth.month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const days: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  return (
    <div className="bg-card rounded-2xl border border-border p-4 w-full max-w-xs">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">{monthLabel}</span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;

          const dateStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          const hasReservations = reservationDates?.has(dateStr);

          return (
            <button
              key={dateStr}
              onClick={() => onSelect(dateStr)}
              className={`relative h-8 w-full rounded-lg text-xs font-medium transition-all ${
                isSelected
                  ? "bg-accent-DEFAULT text-white shadow-sm"
                  : isToday
                  ? "bg-accent-DEFAULT/10 text-accent-DEFAULT font-bold"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {day}
              {hasReservations && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-accent-DEFAULT" />
              )}
            </button>
          );
        })}
      </div>

      {/* Quick buttons */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-border">
        <button
          onClick={() => {
            const t = todayStr();
            onSelect(t);
            const d = new Date();
            setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
        >
          Today
        </button>
        <button
          onClick={() => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            const t = d.toISOString().split("T")[0];
            onSelect(t);
            setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
        >
          Tomorrow
        </button>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function ReservationsPage() {
  const [activeTab, setActiveTab] = useState<"reservations" | "floor" | "waitlist">("reservations");
  const [sections, setSections] = useState<FloorSection[]>([]);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [floorSummary, setFloorSummary] = useState<FloorSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [showAddReservation, setShowAddReservation] = useState(false);
  const [showAddWaitlist, setShowAddWaitlist] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("expected");

  /* ── form states ── */
  const [newRes, setNewRes] = useState({
    guest_name: "",
    guest_phone: "",
    guest_email: "",
    party_size: "2",
    reservation_date: todayStr(),
    start_time: "19:00",
    duration_min: "90",
    special_requests: "",
    source: "phone",
  });
  const [newWait, setNewWait] = useState({
    guest_name: "",
    guest_phone: "",
    party_size: "2",
    estimated_wait_min: "15",
    notes: "",
  });

  const fetchData = useCallback(async () => {
    try {
      const [secRes, tblRes, resRes, wlRes, floorRes] = await Promise.all([
        api.get("/reservations/sections"),
        api.get("/reservations/tables"),
        api.get(`/reservations?reservation_date=${selectedDate}`),
        api.get("/reservations/waitlist/active"),
        api.get("/reservations/floor-summary"),
      ]);
      setSections(secRes.data);
      setTables(tblRes.data);
      setReservations(resRes.data);
      setWaitlist(wlRes.data);
      setFloorSummary(floorRes.data);
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useWebSocket("NEW_RESERVATION", (data) => {
    console.log("New restaurant reservation:", data);
    fetchData();
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (action === "new-reservation") {
      setActiveTab("reservations");
      setShowAddReservation(true);
      setShowAddWaitlist(false);
    }
    if (action === "new-waitlist") {
      setActiveTab("waitlist");
      setShowAddWaitlist(true);
      setShowAddReservation(false);
    }
  }, []);

  /* ── derived ── */
  const filteredTables = selectedSection
    ? tables.filter((t) => t.section_id === selectedSection)
    : tables;

  const getTableReservation = (tableId: number) =>
    reservations.find(
      (r) => r.table_id === tableId && ["confirmed", "seated"].includes(r.status)
    );

  /* Filter reservations by status */
  const filteredReservations = useMemo(() => {
    if (statusFilter === "all") return reservations;
    if (statusFilter === "expected") return reservations.filter((r) => ["confirmed", "seated"].includes(r.status));
    return reservations.filter((r) => r.status === statusFilter);
  }, [reservations, statusFilter]);

  /* Group reservations by time (like gastronovi) */
  const groupedReservations = useMemo(() => {
    const groups: Record<string, Reservation[]> = {};
    const sorted = [...filteredReservations].sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (const res of sorted) {
      const timeKey = formatTime(res.start_time);
      if (!groups[timeKey]) groups[timeKey] = [];
      groups[timeKey].push(res);
    }
    return groups;
  }, [filteredReservations]);

  const totalExpected = reservations.filter((r) => ["confirmed", "seated"].includes(r.status)).length;
  const totalGuests = filteredReservations.reduce((sum, r) => sum + r.party_size, 0);

  /* ── actions ── */
  const handleSeatReservation = async (id: number) => {
    try {
      await api.post(`/reservations/${id}/seat`);
      fetchData();
    } catch {}
  };

  const handleCompleteReservation = async (id: number) => {
    try {
      await api.post(`/reservations/${id}/complete`);
      fetchData();
    } catch {}
  };

  const handleCancelReservation = async (id: number) => {
    try {
      await api.post(`/reservations/${id}/cancel`);
      fetchData();
    } catch {}
  };

  const handleChangeTableStatus = async (tableId: number, status: string) => {
    try {
      await api.patch(`/reservations/tables/${tableId}/status`, { status });
      fetchData();
    } catch {}
  };

  const handleAddReservation = async () => {
    if (!newRes.guest_name) return;
    try {
      await api.post("/reservations", {
        ...newRes,
        party_size: parseInt(newRes.party_size),
        duration_min: parseInt(newRes.duration_min),
        start_time: newRes.start_time + ":00",
      });
      setShowAddReservation(false);
      setNewRes({
        guest_name: "",
        guest_phone: "",
        guest_email: "",
        party_size: "2",
        reservation_date: todayStr(),
        start_time: "19:00",
        duration_min: "90",
        special_requests: "",
        source: "phone",
      });
      fetchData();
    } catch {}
  };

  const handleAddWaitlist = async () => {
    if (!newWait.guest_name) return;
    try {
      await api.post("/reservations/waitlist", {
        ...newWait,
        party_size: parseInt(newWait.party_size),
        estimated_wait_min: parseInt(newWait.estimated_wait_min),
      });
      setShowAddWaitlist(false);
      setNewWait({ guest_name: "", guest_phone: "", party_size: "2", estimated_wait_min: "15", notes: "" });
      fetchData();
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-DEFAULT" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-7 w-7 text-accent-DEFAULT" />
            Reservations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatDateLabel(selectedDate)} &middot; {totalExpected} reservation{totalExpected !== 1 ? "s" : ""} &middot; {totalGuests} guests
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddWaitlist(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm font-medium"
          >
            <Timer className="h-4 w-4" />
            Waitlist
          </button>
          <button
            onClick={() => setShowAddReservation(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            + Reservation
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 bg-card rounded-xl border border-border p-1">
        {(["reservations", "floor", "waitlist"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? "bg-accent-DEFAULT text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "reservations" && `Reservations (${totalExpected})`}
            {tab === "floor" && "Floor Plan"}
            {tab === "waitlist" && `Waitlist (${waitlist.length})`}
          </button>
        ))}
      </div>

      <AuditTimeline compact title="Reservations Action Timeline" entityType="reservations" limit={12} />

      {/* ── Reservations Tab (gastronovi style) ── */}
      {activeTab === "reservations" && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: Reservation list */}
          <div className="flex-1 space-y-4 min-w-0">
            {/* Status filter bar + date nav */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Date navigation */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(d.toISOString().split("T")[0]);
                  }}
                  className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium min-w-[140px] text-center">
                  {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </div>
                <button
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() + 1);
                    setSelectedDate(d.toISOString().split("T")[0]);
                  }}
                  className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { key: "expected", label: "Expected" },
                  { key: "confirmed", label: "Confirmed" },
                  { key: "seated", label: "Seated" },
                  { key: "cancelled", label: "Cancelled" },
                  { key: "all", label: "All" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      statusFilter === f.key
                        ? "bg-accent-DEFAULT text-white"
                        : "bg-card border border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Gastronovi-style table */}
            {filteredReservations.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-12 text-center">
                <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No reservations for this date</p>
                <button
                  onClick={() => setShowAddReservation(true)}
                  className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium"
                >
                  Add Reservation
                </button>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[40px_1fr_120px_100px_80px_120px] sm:grid-cols-[40px_1fr_140px_120px_80px_140px] bg-muted/50 border-b border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <div>St.</div>
                  <div>Guest</div>
                  <div>Time</div>
                  <div>Area</div>
                  <div>Pax</div>
                  <div>Actions</div>
                </div>

                {/* Grouped by time */}
                {Object.entries(groupedReservations).map(([time, group]) => (
                  <div key={time}>
                    {/* Time group header */}
                    <div className="bg-muted/30 border-b border-border px-4 py-2 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-bold text-foreground">
                        {formatDateLabel(selectedDate)}, {time} ({group.length} Reservation{group.length > 1 ? "s" : ""})
                      </span>
                    </div>

                    {/* Reservation rows */}
                    {group.map((res) => {
                      const st = RES_STATUS[res.status] || RES_STATUS.confirmed;
                      const tableInfo = tables.find((t) => t.id === res.table_id);

                      return (
                        <div
                          key={res.id}
                          className="grid grid-cols-[40px_1fr_120px_100px_80px_120px] sm:grid-cols-[40px_1fr_140px_120px_80px_140px] items-center px-4 py-3 border-b border-border/50 hover:bg-muted/20 transition-colors group"
                        >
                          {/* Status dot */}
                          <div>
                            <div className={`h-3 w-3 rounded-full ${st.dot}`} title={res.status} />
                          </div>

                          {/* Guest info */}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {res.guest_name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {res.guest_phone && (
                                <span className="flex items-center gap-0.5">
                                  <Phone className="h-3 w-3" />
                                  {res.guest_phone}
                                </span>
                              )}
                              {res.special_requests && (
                                <span className="flex items-center gap-0.5 text-amber-500">
                                  <AlertCircle className="h-3 w-3" />
                                  Note
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Time */}
                          <div className="text-sm text-foreground">
                            {formatTime(res.start_time)}
                            <span className="text-xs text-muted-foreground ml-1">
                              ({res.duration_min}m)
                            </span>
                          </div>

                          {/* Area / Table */}
                          <div className="text-sm text-muted-foreground truncate">
                            {tableInfo ? `T${tableInfo.table_number}` : "Restaurant"}
                          </div>

                          {/* People */}
                          <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            {res.party_size}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            {res.status === "confirmed" && (
                              <button
                                onClick={() => handleSeatReservation(res.id)}
                                className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-xs font-medium transition-colors"
                                title="Seat"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {res.status === "seated" && (
                              <button
                                onClick={() => handleCompleteReservation(res.id)}
                                className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 text-xs font-medium transition-colors"
                                title="Complete"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {["confirmed", "seated"].includes(res.status) && (
                              <button
                                onClick={() => handleCancelReservation(res.id)}
                                className="px-2 py-1 rounded-md bg-red-500/10 text-red-600 hover:bg-red-500/20 text-xs font-medium transition-colors"
                                title="Cancel"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Footer */}
                <div className="bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground flex items-center justify-between">
                  <span>
                    {filteredReservations.length} of {reservations.length} reservations
                  </span>
                  <span>{totalGuests} total guests</span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Calendar + summary */}
          <div className="lg:w-80 space-y-4">
            <MiniCalendar
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
            />

            {/* Time distribution chart (simple bar chart like gastronovi) */}
            {filteredReservations.length > 0 && (
              <div className="bg-card rounded-2xl border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Time Distribution</h3>
                <div className="space-y-2">
                  {Object.entries(groupedReservations).map(([time, group]) => {
                    const maxGroup = Math.max(...Object.values(groupedReservations).map((g) => g.length));
                    const pct = (group.length / maxGroup) * 100;
                    return (
                      <div key={time} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-12 text-right">{time}</span>
                        <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-foreground w-6 text-right">{group.length}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Floor summary */}
            {floorSummary && (
              <div className="bg-card rounded-2xl border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Table Status</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Available", value: floorSummary.available, dot: "bg-emerald-400" },
                    { label: "Occupied", value: floorSummary.occupied, dot: "bg-blue-400" },
                    { label: "Reserved", value: floorSummary.reserved, dot: "bg-amber-400" },
                    { label: "Blocked", value: floorSummary.blocked, dot: "bg-red-400" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <span className="text-xs font-bold text-foreground ml-auto">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Free tables by section (gastronovi style) */}
            {sections.length > 0 && tables.length > 0 && (
              <div className="bg-card rounded-2xl border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Free Tables</h3>
                {sections.map((sec) => {
                  const sectionTables = tables.filter((t) => t.section_id === sec.id);
                  const freeTables = sectionTables.filter((t) => t.status === "available");
                  // Group free tables by capacity
                  const capGroups: Record<number, number> = {};
                  freeTables.forEach((t) => {
                    capGroups[t.capacity] = (capGroups[t.capacity] || 0) + 1;
                  });
                  const sortedCaps = Object.entries(capGroups).sort(([a], [b]) => Number(a) - Number(b));
                  return (
                    <div key={sec.id} className="mb-3 last:mb-0">
                      <p className="text-xs font-semibold text-foreground mb-1.5">{sec.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sortedCaps.length > 0 ? sortedCaps.map(([cap, count]) => (
                          <span key={cap} className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[11px] font-medium">
                            {count}× {cap} {Number(cap) === 1 ? "seat" : "seats"}
                          </span>
                        )) : (
                          <span className="text-[11px] text-muted-foreground">No free tables</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Floor Plan Tab ── */}
      {activeTab === "floor" && (
        <div className="space-y-4">
          {/* Section filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedSection(null)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedSection === null
                  ? "bg-accent-DEFAULT text-white"
                  : "bg-card border border-border text-muted-foreground"
              }`}
            >
              All Sections ({tables.length})
            </button>
            {sections.map((sec) => {
              const sectionTables = tables.filter((t) => t.section_id === sec.id);
              const sectionSeats = sectionTables.reduce((sum, t) => sum + t.capacity, 0);
              return (
                <button
                  key={sec.id}
                  onClick={() => setSelectedSection(selectedSection === sec.id ? null : sec.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedSection === sec.id
                      ? "bg-accent-DEFAULT text-white"
                      : "bg-card border border-border text-muted-foreground"
                  }`}
                >
                  {sec.name} · {sectionSeats} seats
                </button>
              );
            })}
          </div>

          {/* Tables grouped by section */}
          {filteredTables.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center">
              <Armchair className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No tables configured yet</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(selectedSection
                ? sections.filter((s) => s.id === selectedSection)
                : sections
              ).map((sec) => {
                const sectionTables = tables.filter((t) => t.section_id === sec.id);
                if (sectionTables.length === 0) return null;
                const sectionSeats = sectionTables.reduce((sum, t) => sum + t.capacity, 0);
                // Group by capacity for the summary
                const capGroups: Record<number, number> = {};
                sectionTables.forEach((t) => {
                  capGroups[t.capacity] = (capGroups[t.capacity] || 0) + 1;
                });
                const sortedCaps = Object.entries(capGroups).sort(([a], [b]) => Number(a) - Number(b));

                return (
                  <div key={sec.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                    {/* Section header */}
                    <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-foreground text-base">{sec.name}</h3>
                        <div className="flex gap-3 mt-1 flex-wrap">
                          {sortedCaps.map(([cap, count]) => (
                            <span key={cap} className="text-xs text-muted-foreground">
                              {count}× {cap} {Number(cap) === 1 ? "seat" : "seats"}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-foreground">{sectionSeats}</span>
                        <p className="text-xs text-muted-foreground">seats</p>
                      </div>
                    </div>
                    {/* Table Coordinate System (Floor Plan) */}
                    <div className="p-4 bg-muted/20 overflow-auto">
                      <div 
                        className="relative bg-white/50 dark:bg-black/20 rounded-2xl border border-dashed border-border shadow-inner"
                        style={{ width: "1000px", height: "1200px" }}
                      >
                        {sectionTables.map((table) => {
                          const sc = STATUS_COLORS[table.status] || STATUS_COLORS.available;
                          const res = getTableReservation(table.id);
                          
                          // Liquid Glass Effect Logic with defensive defaults
                          const glassStyle = {
                            position: "absolute" as const,
                            left: `${table.position_x ?? 0}px`,
                            top: `${table.position_y ?? 0}px`,
                            width: `${table.width || 80}px`,
                            height: `${table.height || 80}px`,
                            transform: `rotate(${table.rotation || 0}deg)`,
                            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                          };

                          return (
                            <div
                              key={table.id}
                              style={glassStyle}
                              className={`
                                group cursor-pointer
                                border border-white/40 dark:border-white/10
                                backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.12)]
                                flex flex-col items-center justify-center
                                ${table.shape === "round" ? "rounded-full" : "rounded-2xl"}
                                ${res ? "bg-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.2)]" : 
                                  table.status === "available" ? "bg-white/60 dark:bg-white/5" :
                                  table.status === "occupied" ? "bg-blue-400/20" : "bg-purple-400/20"}
                              `}
                              onClick={() => handleChangeTableStatus(table.id, table.status === "available" ? "occupied" : "available")}
                            >
                              {/* Reflection glaze */}
                              <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent pointer-events-none rounded-[inherit]" />
                              
                              <p className={`text-xs font-black tracking-tighter ${res ? "text-amber-600" : "text-foreground"}`}>
                                #{table.table_number}
                              </p>
                              <p className="text-[9px] font-medium text-muted-foreground opacity-70">
                                {table.capacity}
                              </p>

                              {/* Hover Tooltip/Action Overlay */}
                              <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-20">
                                <div className="bg-black/80 backdrop-blur-lg text-white text-[10px] px-2 py-1 rounded shadow-xl whitespace-nowrap">
                                  {table.status.toUpperCase()} {res ? `| ${res.guest_name}` : ""}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Waitlist Tab ── */}
      {activeTab === "waitlist" && (
        <div className="space-y-4">
          {waitlist.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center">
              <Timer className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Waitlist is empty</p>
              <button
                onClick={() => setShowAddWaitlist(true)}
                className="mt-4 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm"
              >
                Add Guest to Waitlist
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {waitlist.map((entry, i) => (
                <div
                  key={entry.id}
                  className="bg-card rounded-xl border border-border p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-accent-DEFAULT/10 rounded-xl h-10 w-10 flex items-center justify-center">
                      <span className="text-accent-DEFAULT font-bold">#{i + 1}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{entry.guest_name}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {entry.party_size}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          ~{entry.estimated_wait_min} min
                        </span>
                        {entry.guest_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {entry.guest_phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        api
                          .post(`/reservations/waitlist/${entry.id}/seat?table_id=${tables.find((t) => t.status === "available")?.id || 0}`)
                          .then(fetchData)
                      }
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium transition-colors"
                    >
                      Seat Now
                    </button>
                    <button
                      onClick={() => api.delete(`/reservations/waitlist/${entry.id}`).then(fetchData)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add Reservation Modal ── */}
      {showAddReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-accent-DEFAULT" />
                New Reservation
              </h2>
              <button onClick={() => setShowAddReservation(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Guest Name*</label>
                <input
                  type="text"
                  placeholder="Full name"
                  value={newRes.guest_name}
                  onChange={(e) => setNewRes({ ...newRes, guest_name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
                <input
                  type="tel"
                  placeholder="+49..."
                  value={newRes.guest_phone}
                  onChange={(e) => setNewRes({ ...newRes, guest_phone: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                <input
                  type="email"
                  placeholder="email@..."
                  value={newRes.guest_email}
                  onChange={(e) => setNewRes({ ...newRes, guest_email: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                <input
                  type="date"
                  value={newRes.reservation_date}
                  onChange={(e) => setNewRes({ ...newRes, reservation_date: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Time</label>
                <input
                  type="time"
                  value={newRes.start_time}
                  onChange={(e) => setNewRes({ ...newRes, start_time: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Party Size</label>
                <input
                  type="number"
                  min="1"
                  value={newRes.party_size}
                  onChange={(e) => setNewRes({ ...newRes, party_size: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Duration (min)</label>
                <select
                  value={newRes.duration_min}
                  onChange={(e) => setNewRes({ ...newRes, duration_min: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                >
                  <option value="60">60 min</option>
                  <option value="90">90 min</option>
                  <option value="120">2 hours</option>
                  <option value="150">2.5 hours</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Special Requests</label>
                <textarea
                  placeholder="Allergies, celebrations, seating preferences..."
                  value={newRes.special_requests}
                  onChange={(e) => setNewRes({ ...newRes, special_requests: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50 h-20 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddReservation(false)}
                className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleAddReservation}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                Create Reservation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Waitlist Modal ── */}
      {showAddWaitlist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Timer className="h-5 w-5 text-accent-DEFAULT" />
                Add to Waitlist
              </h2>
              <button onClick={() => setShowAddWaitlist(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Guest name"
                value={newWait.guest_name}
                onChange={(e) => setNewWait({ ...newWait, guest_name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={newWait.guest_phone}
                onChange={(e) => setNewWait({ ...newWait, guest_phone: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Party Size</label>
                  <input
                    type="number"
                    min="1"
                    value={newWait.party_size}
                    onChange={(e) => setNewWait({ ...newWait, party_size: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Est. Wait (min)</label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={newWait.estimated_wait_min}
                    onChange={(e) => setNewWait({ ...newWait, estimated_wait_min: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddWaitlist(false)}
                className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleAddWaitlist}
                className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium"
              >
                Add to Waitlist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
