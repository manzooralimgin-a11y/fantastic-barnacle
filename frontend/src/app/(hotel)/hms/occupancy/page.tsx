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
import {
  BedDouble,
  Users,
  Lock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  StickyNote,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function isWeekend(value: string) {
  const day = new Date(value).getDay();
  return day === 0 || day === 6;
}

function deriveInitials(label: string): string {
  const words = label.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
}

/** Derive block background/text classes. color_tag takes precedence for custom colour. */
function blockStyle(block: HotelRoomBoardBlock): {
  className: string;
  inlineStyle: React.CSSProperties;
} {
  if (block.kind === "blocking") {
    return {
      className:
        "bg-gradient-to-r from-red-900/30 to-red-800/18 border border-red-500/30 text-red-300",
      inlineStyle: {},
    };
  }
  if (block.color_tag) {
    return {
      className: "border text-white",
      inlineStyle: {
        backgroundColor: `${block.color_tag}33`,
        borderColor: `${block.color_tag}66`,
        color: block.color_tag,
      },
    };
  }
  if (block.status === "checked_in" || block.status === "checked-in") {
    return {
      className:
        "bg-gradient-to-r from-emerald-600/25 to-emerald-500/15 border border-emerald-500/40 text-emerald-300",
      inlineStyle: {},
    };
  }
  if (block.status === "booked" || block.status === "confirmed") {
    return {
      className:
        "bg-gradient-to-r from-[#c8a951]/18 to-[#c8a951]/8 border border-[#c8a951]/35 text-[#e8d9b0]",
      inlineStyle: {},
    };
  }
  return {
    className: "bg-white/[0.08] border border-white/10 text-white/80",
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

  const initials = deriveInitials(label);

  return (
    <div
      title={label}
      onClick={() => isClickable && onClickStay(block)}
      className={cn(
        "absolute inset-y-1.5 rounded-xl px-2 py-1 shadow-sm backdrop-blur-[8px]",
        "transition-all duration-150 select-none overflow-hidden",
        "flex items-center gap-1.5",
        isClickable && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
        isSelected && "ring-2 ring-[#c8a951] ring-offset-1 ring-offset-[#0d1b11]",
        className,
      )}
      style={{ left: `${leftPct}%`, width: `${widthPct}%`, ...inlineStyle }}
    >
      {/* Left edge indicator for stays starting before the window */}
      {block.starts_before_window && (
        <span className="absolute left-0 inset-y-0 w-[3px] rounded-l-xl bg-current opacity-70" />
      )}

      {/* Initials avatar */}
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-current/20 flex items-center justify-center text-[9px] font-bold opacity-80">
        {initials}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold leading-tight">{label}</p>
        {sublabel && (
          <p className="truncate text-[10px] opacity-70 leading-tight">{sublabel}</p>
        )}
      </div>
    </div>
  );
});

// ── RoomRow ────────────────────────────────────────────────────────────────────

type RoomRowProps = {
  room: HotelRoomBoardRow;
  totalDays: number;
  dateCount: number;
  rowIndex: number;
  selectedReservationId: string | null;
  onClickStay: (block: HotelRoomBoardBlock) => void;
  onClickNotes: (roomId: number | null, roomNumber: string) => void;
};

function statusDotColor(status?: string) {
  if (!status) return "bg-white/20";
  const s = status.toLowerCase();
  if (s === "available" || s === "frei") return "bg-emerald-400";
  if (s === "clean" || s === "sauber") return "bg-sky-400";
  if (s === "occupied" || s === "belegt") return "bg-amber-400";
  if (s === "maintenance" || s === "wartung" || s === "blocked") return "bg-red-400";
  return "bg-white/30";
}

const RoomRow = memo(function RoomRow({
  room,
  totalDays,
  dateCount,
  rowIndex,
  selectedReservationId,
  onClickStay,
  onClickNotes,
}: RoomRowProps) {
  const allBlocks = [...room.blocks, ...room.blockings];

  return (
    <div
      className={cn(
        "grid gap-0 hover:bg-white/[0.015] transition-colors",
        rowIndex % 2 === 0 ? "bg-[#0d1b11]" : "bg-[#0f1f14]",
      )}
      style={{ gridTemplateColumns: "200px minmax(0,1fr)" }}
    >
      {/* Y-axis room label */}
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2 min-h-[56px]">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-black font-mono text-[#e8d9b0] truncate">
            {room.room_number}
          </p>
          {room.status && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className={cn("inline-block w-1.5 h-1.5 rounded-full", statusDotColor(room.status))} />
              <span className="text-[10px] text-white/40 capitalize">{room.status}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onClickNotes(room.room_id, room.room_number)}
          className="flex-shrink-0 rounded-lg p-1.5 text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
          title="Notizen"
        >
          <StickyNote className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Timeline cell */}
      <div className="relative border-b border-white/[0.04]">
        {/* Day-column grid lines */}
        <div
          className="absolute inset-0 grid pointer-events-none"
          style={{ gridTemplateColumns: `repeat(${dateCount}, 1fr)` }}
        >
          {Array.from({ length: dateCount }).map((_, i) => (
            <div key={i} className="border-r border-white/[0.04] last:border-r-0 h-full" />
          ))}
        </div>

        {/* Block pills */}
        <div className="relative h-14">
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
  const blockedCount = rooms.filter((r) => r.blockings.length > 0).length;

  return (
    <div>
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-[#1a3d2b]/80 to-transparent border-l-4 border-[#c8a951]/60 border-b border-white/[0.04] text-left hover:from-[#1a3d2b] transition-colors"
      >
        <span className="flex-shrink-0 text-[#c8a951]/60">
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-200", !open && "-rotate-90")}
          />
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.15em] text-[#e8d9b0]">
          {categoryName}
        </span>
        <div className="flex items-center gap-1.5 ml-2">
          <span className="bg-white/[0.08] rounded-full px-2 py-0.5 text-[10px] text-white/50">
            {rooms.length} Zimmer
          </span>
          {occupiedCount > 0 && (
            <span className="bg-emerald-500/15 text-emerald-400 rounded-full px-2 py-0.5 text-[10px]">
              {occupiedCount} belegt
            </span>
          )}
          {blockedCount > 0 && (
            <span className="bg-red-500/15 text-red-400 rounded-full px-2 py-0.5 text-[10px]">
              {blockedCount} gesperrt
            </span>
          )}
          {totalBlocks > 0 && (
            <span className="bg-white/[0.08] rounded-full px-2 py-0.5 text-[10px] text-white/40">
              {totalBlocks} Blöcke
            </span>
          )}
        </div>
      </button>

      {/* Room rows */}
      {open && (
        <div>
          {rooms.map((room, idx) => (
            <RoomRow
              key={`${room.room_id ?? "virtual"}-${room.room_number}`}
              room={room}
              totalDays={totalDays}
              dateCount={dateCount}
              rowIndex={idx}
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
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-[#e8d9b0] tracking-tight">
            Belegungsplan
          </h1>
          <p className="text-white/40 mt-1 text-sm">
            Live-Belegungskalender · Zimmervergabe · Blockierungen
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Arrow + date pill */}
          <button
            type="button"
            onClick={() => shiftWindow("previous")}
            className="rounded-xl p-2 bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-[#e8d9b0] outline-none focus:ring-2 focus:ring-[#c8a951]/20 transition-shadow"
          />

          <button
            type="button"
            onClick={() => shiftWindow("next")}
            className="rounded-xl p-2 bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Day-range pills */}
          <div className="flex items-center gap-1 ml-1">
            {[7, 14, 21, 30].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDays(n)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                  days === n
                    ? "bg-[#c8a951] text-[#0f1f14] shadow-sm"
                    : "bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/80",
                )}
              >
                {n}T
              </button>
            ))}
          </div>

          {/* Primary CTA */}
          <button
            type="button"
            onClick={() => openReservierung({ propertyId: defaultHotelPropertyId })}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#c8a951] to-[#a8893a] px-4 py-2.5 text-sm font-bold text-[#0f1f14] shadow-sm hover:opacity-90 transition-opacity ml-1"
          >
            <Plus className="h-4 w-4" />
            Neue Reservierung
          </button>
        </div>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Zimmer gesamt */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a3d2b] to-[#0f2318] p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="rounded-xl p-2 bg-white/[0.06]">
              <BedDouble className="h-5 w-5 text-[#c8a951]" />
            </div>
          </div>
          <p className="text-4xl font-bold text-white">{board?.rooms.length ?? 0}</p>
          <p className="text-[11px] uppercase tracking-widest opacity-60 text-white mt-1">Zimmer gesamt</p>
        </div>

        {/* Aufenthalte */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1e3a5f] to-[#0d1f33] p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="rounded-xl p-2 bg-white/[0.06]">
              <Users className="h-5 w-5 text-sky-400" />
            </div>
          </div>
          <p className="text-4xl font-bold text-white">{stayBlocks}</p>
          <p className="text-[11px] uppercase tracking-widest opacity-60 text-white mt-1">Aufenthalte</p>
        </div>

        {/* Gesperrt */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#3d1a1a] to-[#1f0d0d] p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="rounded-xl p-2 bg-white/[0.06]">
              <Lock className="h-5 w-5 text-red-400" />
            </div>
          </div>
          <p className="text-4xl font-bold text-white">{blockedRooms}</p>
          <p className="text-[11px] uppercase tracking-widest opacity-60 text-white mt-1">Gesperrt</p>
        </div>

        {/* Nicht zugewiesen */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#3d2e1a] to-[#1f160d] p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="rounded-xl p-2 bg-white/[0.06]">
              <AlertCircle className="h-5 w-5 text-amber-400" />
            </div>
          </div>
          <p className="text-4xl font-bold text-white">{board?.unassigned_blocks.length ?? 0}</p>
          <p className="text-[11px] uppercase tracking-widest opacity-60 text-white mt-1">Nicht zugewiesen</p>
        </div>
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
        <Card className="bg-[#0d1b11] shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-white/[0.06] bg-gradient-to-r from-[#0d1b11] to-[#1a3d2b] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-editorial text-[#e8d9b0]">Timeline</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftWindow("previous")}
                  className="rounded-xl bg-white/[0.06] hover:bg-white/[0.10] px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Zurück
                </button>
                <button
                  type="button"
                  onClick={() => void boardQuery.refetch()}
                  className="rounded-xl bg-white/[0.06] hover:bg-white/[0.10] px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors"
                >
                  Neu laden
                </button>
                <button
                  type="button"
                  onClick={() => shiftWindow("next")}
                  className="rounded-xl bg-white/[0.06] hover:bg-white/[0.10] px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors flex items-center gap-1"
                >
                  Weiter
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {boardQuery.isLoading && !board ? (
              <div className="p-8 flex items-center gap-3 text-white/40">
                <div className="h-4 w-4 rounded-full border-2 border-[#c8a951]/40 border-t-[#c8a951] animate-spin" />
                <p className="text-sm">Belegungsplan wird geladen…</p>
              </div>
            ) : board ? (
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${200 + board.dates.length * 56}px` }}>

                  {/* Sticky date header row */}
                  <div
                    className="grid border-b border-white/[0.06] bg-[#0d1b11]"
                    style={{ gridTemplateColumns: `200px minmax(0,1fr)` }}
                  >
                    <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#c8a951]/60">
                      Zimmer
                    </div>
                    <div
                      className="grid"
                      style={{ gridTemplateColumns: `repeat(${board.dates.length}, 1fr)` }}
                    >
                      {board.dates.map((d) => {
                        const dateStr = String(d);
                        const today = isToday(dateStr);
                        const weekend = isWeekend(dateStr);
                        return (
                          <div
                            key={dateStr}
                            className={cn(
                              "px-1 py-2 text-center text-[10px] font-semibold border-r border-white/[0.04] last:border-r-0 mx-0.5",
                              today
                                ? "bg-[#c8a951]/20 text-[#c8a951] font-bold rounded-lg"
                                : weekend
                                  ? "text-white/50"
                                  : "text-white/40",
                            )}
                          >
                            {formatDayLabel(dateStr)}
                          </div>
                        );
                      })}
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
            <Card className="bg-gradient-to-b from-[#0f1f14] to-[#0d1b11] border-none shadow-[var(--shadow-soft)]">
              <CardHeader className="border-b border-white/[0.06] px-5 py-4">
                <CardTitle className="text-sm font-editorial text-[#e8d9b0]">
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
                    className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <p className="text-sm font-semibold text-[#e8d9b0] truncate">
                      {block.guest_name || block.booking_id}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {block.check_in} – {block.check_out} · {block.room_type_name || "Kein Zimmertyp"}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Create room blocking */}
          <Card className="bg-gradient-to-b from-[#0f1f14] to-[#0d1b11] border-none shadow-[var(--shadow-soft)]">
            <CardHeader className="border-b border-white/[0.06] px-5 py-4">
              <CardTitle className="text-sm font-editorial text-[#e8d9b0]">
                Zimmer sperren
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form className="space-y-3" onSubmit={handleCreateBlocking}>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#c8a951]/80">
                    Zimmer
                  </label>
                  <select
                    required
                    value={blockingForm.room_id}
                    onChange={(e) => setBlockingForm((p) => ({ ...p, room_id: e.target.value }))}
                    className="w-full rounded-xl border border-[#3a7d52]/25 bg-[#1a3d2b]/30 px-3 py-2 text-sm text-[#e8d9b0] outline-none focus:ring-2 focus:ring-[#c8a951]/20 transition-shadow"
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
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#c8a951]/80">
                        {field === "start_date" ? "Von" : "Bis"}
                      </label>
                      <input
                        required
                        type="date"
                        value={blockingForm[field]}
                        onChange={(e) =>
                          setBlockingForm((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="w-full rounded-xl border border-[#3a7d52]/25 bg-[#1a3d2b]/30 px-3 py-2 text-sm text-[#e8d9b0] outline-none focus:ring-2 focus:ring-[#c8a951]/20 transition-shadow"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#c8a951]/80">
                    Grund
                  </label>
                  <input
                    required
                    value={blockingForm.reason}
                    onChange={(e) => setBlockingForm((p) => ({ ...p, reason: e.target.value }))}
                    placeholder="Wartung, Reinigung, VIP-Reservierung…"
                    className="w-full rounded-xl border border-[#3a7d52]/25 bg-[#1a3d2b]/30 px-3 py-2 text-sm text-[#e8d9b0] placeholder:text-white/20 outline-none focus:ring-2 focus:ring-[#c8a951]/20 transition-shadow"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#c8a951]/80">
                    Notizen
                  </label>
                  <textarea
                    rows={2}
                    value={blockingForm.notes}
                    onChange={(e) => setBlockingForm((p) => ({ ...p, notes: e.target.value }))}
                    className="w-full resize-none rounded-xl border border-[#3a7d52]/25 bg-[#1a3d2b]/30 px-3 py-2 text-sm text-[#e8d9b0] placeholder:text-white/20 outline-none focus:ring-2 focus:ring-[#c8a951]/20 transition-shadow"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-gradient-to-r from-[#c8a951] to-[#a8893a] px-4 py-2.5 text-sm font-bold text-[#0f1f14] hover:opacity-90 transition-opacity disabled:opacity-60"
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
