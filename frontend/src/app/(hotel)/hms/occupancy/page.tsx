"use client";

/**
 * Belegungsplan — Ticket 1.1 (grid) + Ticket 1.2 (sidebar interaction)
 *
 * Architecture:
 *  • RoomCategoryGroup  — one collapsible accordion row per room type
 *  • BoardBlock         — individual stay/blocking pill; memoized per block key
 *  • BoardHeader        — sticky date column headers
 *
 * Performance:
 *  • Every room row is wrapped in React.memo → only re-renders when its own
 *    blocks change, not when a sibling room is clicked.
 *  • The selected reservation ID is kept in a Zustand store → selector
 *    subscriptions avoid prop-drilling re-renders up the tree.
 *  • The occupancy board is only re-fetched when startDate / days change.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/components/shared/api-error";
import { ReservationSummaryRail } from "@/features/hms/pms/components/cockpit/ReservationSummaryRail";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import { useOpenReservationWorkspace } from "@/features/hms/pms/hooks/useOpenReservationWorkspace";
import { useBoardData } from "@/features/hms/pms/hooks/useBoardData";
import { usePmsBoardStore } from "@/features/hms/pms/stores/pmsBoardStore";
import { usePmsSelectionStore } from "@/features/hms/pms/stores/pmsSelectionStore";
import { useReservierungStore } from "@/features/hms/pms/stores/reservierungStore";
import { PMS_RESERVATIONS_REFRESH_EVENT } from "@/features/hms/pms/api/reservations";
import { defaultHotelPropertyId, fetchHotelRooms, type HotelRoomItem } from "@/lib/hotel-room-types";
import { createRoomBlocking, type HotelRoomBoardBlock, type HotelRoomBoardRow } from "@/lib/hms";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDayLabel(value: string) {
  const d = new Date(value);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function isToday(value: string) {
  return new Date(value).toDateString() === new Date().toDateString();
}

/** Derive block background/text classes. color_tag takes precedence for custom colour. */
function blockStyle(block: HotelRoomBoardBlock): {
  className: string;
  inlineStyle: React.CSSProperties;
} {
  if (block.kind === "blocking") {
    return {
      className: "border border-status-danger/30 text-status-danger bg-status-danger/15",
      inlineStyle: {},
    };
  }
  if (block.color_tag) {
    return {
      className: "border text-white",
      inlineStyle: {
        backgroundColor: `${block.color_tag}33`, // 20% opacity
        borderColor: `${block.color_tag}66`,
        color: block.color_tag,
      },
    };
  }
  if (block.status === "checked_in" || block.status === "checked-in") {
    return {
      className: "bg-emerald-500/15 border border-emerald-500/30 text-emerald-700",
      inlineStyle: {},
    };
  }
  if (block.status === "booked" || block.status === "confirmed") {
    return {
      className: "bg-primary/15 border border-primary/30 text-primary",
      inlineStyle: {},
    };
  }
  return {
    className: "bg-foreground/10 border border-foreground/15 text-foreground",
    inlineStyle: {},
  };
}

// ── BoardBlock ─────────────────────────────────────────────────────────────────

type BoardBlockProps = {
  block: HotelRoomBoardBlock;
  totalDays: number;
  selectedReservationId: string | null;
  onClickStay: (block: HotelRoomBoardBlock) => void;
};

const BoardBlock = memo(function BoardBlock({
  block,
  totalDays,
  selectedReservationId,
  onClickStay,
}: BoardBlockProps) {
  const leftPct = (block.start_offset / totalDays) * 100;
  const widthPct = (block.span_days / totalDays) * 100;
  const isSelected =
    block.reservation_id !== null &&
    String(block.reservation_id) === selectedReservationId;
  const isClickable = block.kind !== "blocking" && block.reservation_id !== null;
  const { className, inlineStyle } = blockStyle(block);

  const label =
    block.kind === "blocking"
      ? block.reason || "Gesperrt"
      : block.guest_name || block.booking_id || "Stay";

  const sublabel =
    block.kind === "blocking"
      ? `${block.check_in} – ${block.check_out}`
      : block.booking_id ?? "";

  return (
    <div
      title={label}
      onClick={() => isClickable && onClickStay(block)}
      className={cn(
        "absolute inset-y-1.5 rounded-xl px-2.5 py-1.5 shadow-sm backdrop-blur-[8px]",
        "transition-all duration-150 select-none overflow-hidden",
        isClickable && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
        isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-card",
        className,
      )}
      style={{ left: `${leftPct}%`, width: `${widthPct}%`, ...inlineStyle }}
    >
      {/* Left edge indicator for stays starting before the window */}
      {block.starts_before_window && (
        <span className="absolute left-0 inset-y-0 w-1 rounded-l-xl bg-current opacity-50" />
      )}
      <p className="truncate text-xs font-semibold leading-tight">{label}</p>
      {sublabel && (
        <p className="truncate text-[10px] opacity-70 leading-tight mt-0.5">{sublabel}</p>
      )}
    </div>
  );
});

// ── RoomRow ────────────────────────────────────────────────────────────────────

type RoomRowProps = {
  room: HotelRoomBoardRow;
  totalDays: number;
  dateCount: number;
  selectedReservationId: string | null;
  onClickStay: (block: HotelRoomBoardBlock) => void;
  onClickNotes: (roomId: number | null, roomNumber: string) => void;
};

const RoomRow = memo(function RoomRow({
  room,
  totalDays,
  dateCount,
  selectedReservationId,
  onClickStay,
  onClickNotes,
}: RoomRowProps) {
  const allBlocks = [...room.blocks, ...room.blockings];

  return (
    <div className="grid gap-0" style={{ gridTemplateColumns: "200px minmax(0,1fr)" }}>
      {/* Y-axis room label */}
      <div className="flex items-center gap-2 border-b border-foreground/[0.05] px-3 py-2 bg-foreground/[0.01]">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs font-bold text-foreground truncate">{room.room_number}</p>
          {room.status && (
            <Badge variant="secondary" className="mt-0.5 text-[9px] border-transparent capitalize">
              {room.status}
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={() => onClickNotes(room.room_id, room.room_number)}
          className="flex-shrink-0 rounded-lg border border-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground-muted hover:text-foreground hover:border-foreground/20 transition-colors"
        >
          Notes
        </button>
      </div>

      {/* Timeline cell */}
      <div className="relative border-b border-foreground/[0.05]">
        {/* Day-column grid lines */}
        <div
          className="absolute inset-0 grid pointer-events-none"
          style={{ gridTemplateColumns: `repeat(${dateCount}, 1fr)` }}
        >
          {Array.from({ length: dateCount }).map((_, i) => (
            <div key={i} className="border-r border-foreground/[0.05] last:border-r-0 h-full" />
          ))}
        </div>

        {/* Block pills */}
        <div className="relative h-12">
          {allBlocks.map((block) => (
            <BoardBlock
              key={`${block.kind}-${block.blocking_id ?? block.stay_id ?? block.booking_id}-${block.start_offset}`}
              block={block}
              totalDays={totalDays}
              selectedReservationId={selectedReservationId}
              onClickStay={onClickStay}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

// ── RoomCategoryGroup ─────────────────────────────────────────────────────────

type RoomCategoryGroupProps = {
  categoryName: string;
  rooms: HotelRoomBoardRow[];
  totalDays: number;
  dateCount: number;
  selectedReservationId: string | null;
  onClickStay: (block: HotelRoomBoardBlock) => void;
  onClickNotes: (roomId: number | null, roomNumber: string) => void;
};

const RoomCategoryGroup = memo(function RoomCategoryGroup({
  categoryName,
  rooms,
  totalDays,
  dateCount,
  selectedReservationId,
  onClickStay,
  onClickNotes,
}: RoomCategoryGroupProps) {
  const [open, setOpen] = useState(true);

  const totalBlocks = rooms.reduce((sum, r) => sum + r.blocks.length + r.blockings.length, 0);
  const occupiedCount = rooms.filter((r) =>
    r.blocks.some((b) => b.status === "checked_in" || b.status === "checked-in"),
  ).length;

  return (
    <div>
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors border-b border-foreground/10 text-left"
      >
        <span className="flex-shrink-0 text-foreground-muted">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">
          {categoryName}
        </span>
        <span className="text-[10px] text-foreground-muted">
          {rooms.length} Zimmer · {occupiedCount} belegt · {totalBlocks} Blöcke
        </span>
      </button>

      {/* Room rows */}
      {open && (
        <div>
          {rooms.map((room) => (
            <RoomRow
              key={`${room.room_id ?? "virtual"}-${room.room_number}`}
              room={room}
              totalDays={totalDays}
              dateCount={dateCount}
              selectedReservationId={selectedReservationId}
              onClickStay={onClickStay}
              onClickNotes={onClickNotes}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ── Page ──────────────────────────────────────────────────────────────────────

type BlockingFormState = {
  room_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  notes: string;
};

const emptyBlockingForm: BlockingFormState = {
  room_id: "",
  start_date: "",
  end_date: "",
  reason: "",
  notes: "",
};

export default function OccupancyBoardPage() {
  const { openPanel } = useRightPanel();
  const openReservationWorkspace = useOpenReservationWorkspace();
  const boardQuery = useBoardData();
  const board = boardQuery.data ?? null;

  // Refetch the board whenever a reservation is created or updated elsewhere
  // (e.g. after the ReservierungModal successfully saves).
  useEffect(() => {
    const handler = () => { void boardQuery.refetch(); };
    window.addEventListener(PMS_RESERVATIONS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(PMS_RESERVATIONS_REFRESH_EVENT, handler);
  }, [boardQuery.refetch]);

  const days = usePmsBoardStore((s) => s.days);
  const setDays = usePmsBoardStore((s) => s.setDays);
  const startDate = usePmsBoardStore((s) => s.startDate);
  const setStartDate = usePmsBoardStore((s) => s.setStartDate);
  const shiftWindow = usePmsBoardStore((s) => s.shiftWindow);

  const selectedReservationId = usePmsSelectionStore((s) => s.selectedReservationId);
  const setSelectedReservationId = usePmsSelectionStore((s) => s.setSelectedReservationId);
  const setSelectedRoomId = usePmsSelectionStore((s) => s.setSelectedRoomId);

  const openReservierung = useReservierungStore((s) => s.open);

  const [rooms, setRooms] = useState<HotelRoomItem[]>([]);
  const [blockingForm, setBlockingForm] = useState<BlockingFormState>(emptyBlockingForm);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadRooms() {
      try {
        setRooms(await fetchHotelRooms(defaultHotelPropertyId));
        setFetchError(null);
      } catch {
        setFetchError("Failed to load the occupancy board.");
      }
    }
    void loadRooms();
  }, []);

  // Group board rows by room_type_name
  const roomGroups = useMemo<Map<string, HotelRoomBoardRow[]>>(() => {
    if (!board?.rooms) return new Map();
    const groups = new Map<string, HotelRoomBoardRow[]>();
    for (const room of board.rooms) {
      const key = room.room_type_name || "Sonstige";
      const arr = groups.get(key) ?? [];
      arr.push(room);
      groups.set(key, arr);
    }
    return groups;
  }, [board?.rooms]);

  // Stats
  const blockedRooms = useMemo(
    () => board?.rooms.filter((r) => r.blockings.length > 0).length ?? 0,
    [board?.rooms],
  );
  const stayBlocks = useMemo(
    () => board?.rooms.reduce((sum, r) => sum + r.blocks.length, 0) ?? 0,
    [board?.rooms],
  );

  const handleBlockStay = useCallback(
    (block: HotelRoomBoardBlock) => {
      setSelectedReservationId(String(block.reservation_id));
      openReservationWorkspace(block.reservation_id!);
      if (block.room_id) setSelectedRoomId(String(block.room_id));
    },
    [setSelectedReservationId, openReservationWorkspace, setSelectedRoomId],
  );

  const handleNotesPanel = useCallback(
    (roomId: number | null, roomNumber: string) => {
      if (!roomId) return;
      openPanel({
        type: "room.notes",
        data: { roomId: String(roomId), roomNumber, noteDate: startDate },
        title: `Room ${roomNumber} Notes`,
      });
    },
    [openPanel, startDate],
  );

  const handleCreateBlocking = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createRoomBlocking(
        {
          room_id: Number(blockingForm.room_id),
          start_date: blockingForm.start_date,
          end_date: blockingForm.end_date,
          reason: blockingForm.reason,
          notes: blockingForm.notes || undefined,
        },
        defaultHotelPropertyId,
      );
      setBlockingForm(emptyBlockingForm);
      await boardQuery.refetch();
    } catch {
      setFetchError("Failed to create room blocking.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">
            Belegungsplan
          </h1>
          <p className="text-foreground-muted mt-1 text-sm">
            Live-Belegungskalender · Zimmervergabe · Blockierungen
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date controls */}
          <label className="text-sm text-foreground-muted flex items-center gap-2">
            Start
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border border-foreground/10 bg-card px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="text-sm text-foreground-muted flex items-center gap-2">
            Tage
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-xl border border-foreground/10 bg-card px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              {[7, 14, 21, 30].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          {/* Primary CTA */}
          <button
            type="button"
            onClick={() => openReservierung({ propertyId: defaultHotelPropertyId })}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Neue Reservierung
          </button>
        </div>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Zimmer gesamt", value: board?.rooms.length ?? 0 },
          { label: "Aufenthalte", value: stayBlocks },
          { label: "Gesperrt", value: blockedRooms },
          { label: "Nicht zugewiesen", value: board?.unassigned_blocks.length ?? 0 },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p>
              <p className="mt-2 text-3xl font-editorial font-bold text-foreground">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(fetchError || boardQuery.error) && (
        <ApiError
          message={fetchError || "Belegungsplan konnte nicht geladen werden."}
          onRetry={() => { setFetchError(null); void boardQuery.refetch(); }}
          dismissible={false}
        />
      )}

      {/* ── Main two-column layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">

        {/* ── LEFT: Timeline grid ─────────────────────────────────────────── */}
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-editorial text-foreground">Timeline</CardTitle>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftWindow("previous")}
                  className="rounded-xl border border-foreground/10 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-foreground/[0.03] transition-colors"
                >
                  ← Zurück
                </button>
                <button
                  type="button"
                  onClick={() => void boardQuery.refetch()}
                  className="rounded-xl border border-foreground/10 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-foreground/[0.03] transition-colors"
                >
                  Neu laden
                </button>
                <button
                  type="button"
                  onClick={() => shiftWindow("next")}
                  className="rounded-xl border border-foreground/10 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-foreground/[0.03] transition-colors"
                >
                  Weiter →
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {boardQuery.isLoading && !board ? (
              <p className="p-6 text-sm text-foreground-muted">Belegungsplan wird geladen…</p>
            ) : board ? (
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${200 + board.dates.length * 56}px` }}>

                  {/* Sticky date header row */}
                  <div
                    className="grid border-b border-foreground/10 bg-foreground/[0.02]"
                    style={{ gridTemplateColumns: `200px minmax(0,1fr)` }}
                  >
                    <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                      Zimmer
                    </div>
                    <div
                      className="grid"
                      style={{ gridTemplateColumns: `repeat(${board.dates.length}, 1fr)` }}
                    >
                      {board.dates.map((d) => (
                        <div
                          key={String(d)}
                          className={cn(
                            "px-1 py-2 text-center text-[10px] font-semibold border-r border-foreground/[0.05] last:border-r-0",
                            isToday(String(d))
                              ? "text-primary font-bold"
                              : "text-foreground-muted",
                          )}
                        >
                          {formatDayLabel(String(d))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Category accordion groups */}
                  {Array.from(roomGroups.entries()).map(([category, groupRooms]) => (
                    <RoomCategoryGroup
                      key={category}
                      categoryName={category}
                      rooms={groupRooms}
                      totalDays={board.days}
                      dateCount={board.dates.length}
                      selectedReservationId={selectedReservationId}
                      onClickStay={handleBlockStay}
                      onClickNotes={handleNotesPanel}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ── RIGHT: Sidebar ───────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Reservation summary rail */}
          <ReservationSummaryRail
            reservationId={selectedReservationId}
            emptyTitle="Keine Reservierung ausgewählt"
            emptyDescription="Buchungsblock im Kalender anklicken, um Details anzuzeigen."
          />

          {/* Unassigned stays */}
          {board && board.unassigned_blocks.length > 0 && (
            <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
              <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-5 py-4">
                <CardTitle className="text-sm font-editorial text-foreground">
                  Nicht zugewiesen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4">
                {board.unassigned_blocks.map((block) => (
                  <button
                    key={`${block.booking_id}-${block.start_offset}`}
                    type="button"
                    onClick={() =>
                      block.reservation_id &&
                      setSelectedReservationId(String(block.reservation_id))
                    }
                    className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3 text-left hover:bg-foreground/[0.04] transition-colors"
                  >
                    <p className="text-sm font-semibold text-foreground truncate">
                      {block.guest_name || block.booking_id}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground-muted">
                      {block.check_in} – {block.check_out} · {block.room_type_name || "Kein Zimmertyp"}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Create room blocking */}
          <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-5 py-4">
              <CardTitle className="text-sm font-editorial text-foreground">
                Zimmer sperren
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form className="space-y-3" onSubmit={handleCreateBlocking}>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                    Zimmer
                  </label>
                  <select
                    required
                    value={blockingForm.room_id}
                    onChange={(e) => setBlockingForm((p) => ({ ...p, room_id: e.target.value }))}
                    className="w-full rounded-xl border border-foreground/10 bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Zimmer wählen</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.number} · {r.room_type_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(["start_date", "end_date"] as const).map((field) => (
                    <div key={field}>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                        {field === "start_date" ? "Von" : "Bis"}
                      </label>
                      <input
                        required
                        type="date"
                        value={blockingForm[field]}
                        onChange={(e) =>
                          setBlockingForm((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="w-full rounded-xl border border-foreground/10 bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                    Grund
                  </label>
                  <input
                    required
                    value={blockingForm.reason}
                    onChange={(e) => setBlockingForm((p) => ({ ...p, reason: e.target.value }))}
                    placeholder="Wartung, Reinigung, VIP-Reservierung…"
                    className="w-full rounded-xl border border-foreground/10 bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                    Notizen
                  </label>
                  <textarea
                    rows={2}
                    value={blockingForm.notes}
                    onChange={(e) => setBlockingForm((p) => ({ ...p, notes: e.target.value }))}
                    className="w-full resize-none rounded-xl border border-foreground/10 bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.10] px-4 py-2.5 text-sm font-semibold text-foreground transition-colors disabled:opacity-60"
                >
                  {saving ? "Speichern…" : "Sperre anlegen"}
                </button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
