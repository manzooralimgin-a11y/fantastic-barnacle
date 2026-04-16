"use client";

/**
 * Belegungsplan — premium hotel PMS board
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
  Moon,
  Circle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/components/shared/api-error";
import { ReservationSummaryRail } from "@/features/hms/pms/components/cockpit/ReservationSummaryRail";
import { GuestQuickActionsDrawer } from "@/features/hms/pms/components/front-desk/GuestQuickActionsDrawer";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import { useBoardData } from "@/features/hms/pms/hooks/useBoardData";
import { usePmsBoardStore } from "@/features/hms/pms/stores/pmsBoardStore";
import { usePmsSelectionStore } from "@/features/hms/pms/stores/pmsSelectionStore";
import { useReservierungStore } from "@/features/hms/pms/stores/reservierungStore";
import { PMS_RESERVATIONS_REFRESH_EVENT } from "@/features/hms/pms/api/reservations";
import type { PmsCockpitItem } from "@/features/hms/pms/schemas/reservation";
import { defaultHotelPropertyId, fetchHotelRooms, type HotelRoomItem } from "@/lib/hotel-room-types";
import { createRoomBlocking, type HotelRoomBoardBlock, type HotelRoomBoardRow } from "@/lib/hms";
import { cn } from "@/lib/utils";

// ── Category color palette ────────────────────────────────────────────────────
// Each room category gets a unique accent for its border, header glow, etc.
const CATEGORY_COLORS: Record<string, { border: string; glow: string; badge: string; dot: string }> = {
  "4 Pax+ Appartment": {
    border: "border-l-violet-500/70",
    glow: "from-violet-900/40",
    badge: "bg-violet-500/15 text-violet-300",
    dot: "bg-violet-400",
  },
  "Komfort": {
    border: "border-l-sky-500/70",
    glow: "from-sky-900/40",
    badge: "bg-sky-500/15 text-sky-300",
    dot: "bg-sky-400",
  },
  "Komfort Plus": {
    border: "border-l-emerald-500/70",
    glow: "from-emerald-900/40",
    badge: "bg-emerald-500/15 text-emerald-300",
    dot: "bg-emerald-400",
  },
  "Suite Deluxe": {
    border: "border-l-[#c8a951]/80",
    glow: "from-[#3d2e10]/60",
    badge: "bg-[#c8a951]/15 text-[#c8a951]",
    dot: "bg-[#c8a951]",
  },
  "Tagung": {
    border: "border-l-orange-500/70",
    glow: "from-orange-900/30",
    badge: "bg-orange-500/15 text-orange-300",
    dot: "bg-orange-400",
  },
};

function getCategoryColors(name: string) {
  return CATEGORY_COLORS[name] ?? {
    border: "border-l-white/20",
    glow: "from-white/5",
    badge: "bg-white/10 text-white/50",
    dot: "bg-white/30",
  };
}

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

/** Is payment complete? Checks both German and English fields. */
function isPaymentPaid(block: HotelRoomBoardBlock): boolean | null {
  if (block.kind === "blocking") return null; // no payment concept
  const z = (block.zahlungs_status ?? "").toLowerCase();
  const p = (block.payment_status ?? "").toLowerCase();
  if (z === "bezahlt" || p === "paid") return true;
  if (z === "offen" || p === "pending" || p === "unpaid" || p === "outstanding") return false;
  return null; // unknown
}

/** Derive pill color theme per status */
type BlockTheme = {
  pill: string;
  edge: string;
  avatarRing: string;
  inlineStyle: React.CSSProperties;
};

function blockTheme(block: HotelRoomBoardBlock): BlockTheme {
  if (block.kind === "blocking") {
    return {
      pill: "bg-gradient-to-r from-rose-900/50 via-red-800/35 to-red-900/25 border border-rose-500/40 text-rose-200",
      edge: "bg-rose-400",
      avatarRing: "ring-rose-500/40",
      inlineStyle: {},
    };
  }
  if (block.color_tag) {
    return {
      pill: "border text-white",
      edge: "bg-current",
      avatarRing: "ring-current/40",
      inlineStyle: {
        backgroundColor: `${block.color_tag}2a`,
        borderColor: `${block.color_tag}55`,
        color: block.color_tag,
      },
    };
  }
  const s = block.status ?? "";
  if (s === "checked_in" || s === "checked-in") {
    return {
      pill: "bg-gradient-to-r from-emerald-500/30 via-emerald-600/22 to-green-700/18 border border-emerald-400/50 text-emerald-200",
      edge: "bg-emerald-400",
      avatarRing: "ring-emerald-400/40",
      inlineStyle: {},
    };
  }
  if (s === "booked" || s === "confirmed") {
    return {
      pill: "bg-gradient-to-r from-[#c8a951]/28 via-[#b8963e]/18 to-[#a8863a]/12 border border-[#c8a951]/50 text-[#f0e0a0]",
      edge: "bg-[#c8a951]",
      avatarRing: "ring-[#c8a951]/40",
      inlineStyle: {},
    };
  }
  if (s === "pending") {
    return {
      pill: "bg-gradient-to-r from-violet-600/25 via-violet-700/18 to-blue-800/14 border border-violet-400/40 text-violet-200",
      edge: "bg-violet-400",
      avatarRing: "ring-violet-400/40",
      inlineStyle: {},
    };
  }
  return {
    pill: "bg-white/[0.07] border border-white/[0.12] text-white/80",
    edge: "bg-white/40",
    avatarRing: "ring-white/20",
    inlineStyle: {},
  };
}

// ── PaymentDot ─────────────────────────────────────────────────────────────────

function PaymentDot({ paid }: { paid: boolean | null }) {
  if (paid === null) return null;
  return (
    <span
      title={paid ? "Bezahlt" : "Offen"}
      className={cn(
        "flex-shrink-0 w-2 h-2 rounded-full ring-1",
        paid
          ? "bg-emerald-400 ring-emerald-300/60 shadow-[0_0_4px_rgba(52,211,153,0.6)]"
          : "bg-rose-500 ring-rose-400/60 shadow-[0_0_4px_rgba(244,63,94,0.6)]",
      )}
    />
  );
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
  const theme = blockTheme(block);
  const paid = isPaymentPaid(block);

  const label =
    block.kind === "blocking"
      ? block.reason || "Gesperrt"
      : block.guest_name || block.booking_id || "Stay";

  const nightsLabel =
    block.kind !== "blocking" && block.span_days > 0
      ? `${block.span_days}N`
      : null;

  const initials = block.kind === "blocking" ? "🚫" : deriveInitials(label);

  return (
    <div
      title={`${label}${paid !== null ? (paid ? " · Bezahlt" : " · Offen") : ""}`}
      onClick={() => isClickable && onClickStay(block)}
      className={cn(
        "absolute inset-y-1.5 rounded-xl backdrop-blur-[6px]",
        "transition-all duration-150 select-none overflow-hidden",
        "flex items-center gap-1.5 pl-[5px] pr-2 py-1",
        isClickable && "cursor-pointer hover:-translate-y-[2px] hover:shadow-lg hover:brightness-110",
        isSelected && "ring-2 ring-[#c8a951] ring-offset-1 ring-offset-[#0d1b11] brightness-110",
        theme.pill,
      )}
      style={{ left: `${leftPct}%`, width: `${widthPct}%`, ...theme.inlineStyle }}
    >
      {/* Coloured left edge bar */}
      <span className={cn("absolute left-0 inset-y-0 w-[3px] rounded-l-xl opacity-90", theme.edge)} />

      {/* Initials avatar */}
      {block.kind !== "blocking" && (
        <span
          className={cn(
            "flex-shrink-0 w-[22px] h-[22px] rounded-full bg-black/20 ring-1 flex items-center justify-center text-[8px] font-black tracking-tight",
            theme.avatarRing,
          )}
        >
          {initials}
        </span>
      )}

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold leading-tight">{label}</p>
        {block.kind !== "blocking" && block.booking_id && (
          <p className="truncate text-[9px] opacity-55 leading-tight font-mono">{block.booking_id}</p>
        )}
        {block.kind === "blocking" && (
          <p className="truncate text-[9px] opacity-55 leading-tight">
            {block.check_in} – {block.check_out}
          </p>
        )}
      </div>

      {/* Night count badge */}
      {nightsLabel && widthPct > 8 && (
        <span className="flex-shrink-0 flex items-center gap-0.5 bg-black/20 rounded-full px-1.5 py-0.5 text-[8px] font-bold opacity-80">
          <Moon className="h-2 w-2" />
          {nightsLabel}
        </span>
      )}

      {/* Payment dot — always visible on the right */}
      <PaymentDot paid={paid} />
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
  categoryDot: string;
};

function statusConfig(status?: string): { dot: string; label: string; color: string } {
  if (!status) return { dot: "bg-white/20", label: "", color: "text-white/30" };
  const s = status.toLowerCase();
  if (s === "available") return { dot: "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]", label: "Frei", color: "text-emerald-400/70" };
  if (s === "clean") return { dot: "bg-sky-400 shadow-[0_0_4px_rgba(56,189,248,0.5)]", label: "Sauber", color: "text-sky-400/70" };
  if (s === "occupied") return { dot: "bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.5)]", label: "Belegt", color: "text-amber-400/70" };
  if (s === "maintenance" || s === "blocked") return { dot: "bg-rose-400 shadow-[0_0_4px_rgba(251,113,133,0.5)]", label: "Wartung", color: "text-rose-400/70" };
  if (s === "cleaning") return { dot: "bg-purple-400 shadow-[0_0_4px_rgba(192,132,252,0.5)]", label: "Reinigung", color: "text-purple-400/70" };
  return { dot: "bg-white/30", label: status, color: "text-white/40" };
}

const RoomRow = memo(function RoomRow({
  room,
  totalDays,
  dateCount,
  rowIndex,
  selectedReservationId,
  onClickStay,
  onClickNotes,
  categoryDot,
}: RoomRowProps) {
  const allBlocks = [...room.blocks, ...room.blockings];
  const sc = statusConfig(room.status ?? undefined);

  return (
    <div
      className={cn(
        "grid gap-0 group transition-colors duration-100",
        rowIndex % 2 === 0 ? "bg-[#0d1b11]" : "bg-[#0c1910]",
        "hover:bg-white/[0.018]",
      )}
      style={{ gridTemplateColumns: "200px minmax(0,1fr)" }}
    >
      {/* Y-axis room label */}
      <div className="flex items-center gap-2 border-b border-white/[0.035] px-3 py-2 min-h-[60px]">
        {/* Category colour micro-bar */}
        <span className={cn("flex-shrink-0 w-[3px] h-8 rounded-full opacity-60", categoryDot)} />

        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-black font-mono text-[#e8d9b0] leading-tight tracking-tight">
            {room.room_number}
          </p>
          {room.status && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className={cn("inline-block w-[6px] h-[6px] rounded-full flex-shrink-0", sc.dot)} />
              <span className={cn("text-[9px] font-semibold capitalize", sc.color)}>{sc.label}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onClickNotes(room.room_id, room.room_number)}
          className="flex-shrink-0 rounded-lg p-1.5 text-white/20 hover:text-[#c8a951]/70 hover:bg-[#c8a951]/[0.08] opacity-0 group-hover:opacity-100 transition-all"
          title="Notizen"
        >
          <StickyNote className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Timeline cell */}
      <div className="relative border-b border-white/[0.035]">
        {/* Day-column grid lines */}
        <div
          className="absolute inset-0 grid pointer-events-none"
          style={{ gridTemplateColumns: `repeat(${dateCount}, 1fr)` }}
        >
          {Array.from({ length: dateCount }).map((_, i) => (
            <div key={i} className="border-r border-white/[0.03] last:border-r-0 h-full" />
          ))}
        </div>

        {/* Block pills */}
        <div className="relative h-[60px]">
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
  const colors = getCategoryColors(categoryName);

  const totalBlocks = rooms.reduce((sum, r) => sum + r.blocks.length + r.blockings.length, 0);
  const occupiedCount = rooms.filter((r) =>
    r.blocks.some((b) => b.status === "checked_in" || b.status === "checked-in"),
  ).length;
  const blockedCount = rooms.filter((r) => r.blockings.length > 0).length;
  const occupancyPct = rooms.length > 0 ? Math.round((occupiedCount / rooms.length) * 100) : 0;

  return (
    <div>
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-2.5",
          "bg-gradient-to-r to-transparent border-l-4 border-b border-white/[0.04]",
          "text-left hover:brightness-110 transition-all",
          colors.border,
          colors.glow,
        )}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-white/40 transition-transform duration-200 flex-shrink-0",
            !open && "-rotate-90",
          )}
        />

        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#e8d9b0] flex-shrink-0">
          {categoryName}
        </span>

        {/* Occupancy mini-bar */}
        {occupiedCount > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400/70 transition-all"
                style={{ width: `${occupancyPct}%` }}
              />
            </div>
            <span className="text-[9px] text-white/40">{occupancyPct}%</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold", colors.badge)}>
            {rooms.length} Zimmer
          </span>
          {occupiedCount > 0 && (
            <span className="bg-emerald-500/18 text-emerald-300 rounded-full px-2 py-0.5 text-[9px] font-semibold">
              {occupiedCount} belegt
            </span>
          )}
          {blockedCount > 0 && (
            <span className="bg-rose-500/18 text-rose-300 rounded-full px-2 py-0.5 text-[9px] font-semibold">
              {blockedCount} gesperrt
            </span>
          )}
          {totalBlocks > 0 && (
            <span className="bg-white/[0.07] text-white/40 rounded-full px-2 py-0.5 text-[9px] font-semibold">
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
              categoryDot={colors.dot}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ── StatusLegend ──────────────────────────────────────────────────────────────

function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[10px] font-semibold">
      <span className="text-white/30 uppercase tracking-widest text-[9px]">Legende</span>

      <span className="flex items-center gap-1.5 text-emerald-300/80">
        <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-emerald-500/40 to-emerald-600/30 border border-emerald-400/50" />
        Eingecheckt
      </span>
      <span className="flex items-center gap-1.5 text-[#f0e0a0]/80">
        <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-[#c8a951]/35 to-[#a8863a]/20 border border-[#c8a951]/50" />
        Bestätigt
      </span>
      <span className="flex items-center gap-1.5 text-violet-300/80">
        <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-violet-600/30 to-blue-700/20 border border-violet-400/40" />
        Ausstehend
      </span>
      <span className="flex items-center gap-1.5 text-rose-300/80">
        <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-rose-900/50 to-red-800/30 border border-rose-500/40" />
        Gesperrt
      </span>

      {/* Divider */}
      <span className="w-px h-4 bg-white/10" />

      <span className="flex items-center gap-1.5 text-white/50">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
        Bezahlt
      </span>
      <span className="flex items-center gap-1.5 text-white/50">
        <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_4px_rgba(244,63,94,0.6)]" />
        Offen
      </span>
    </div>
  );
}

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
  const boardQuery = useBoardData();
  const board = boardQuery.data ?? null;

  // Guest quick-actions drawer (same component Front Desk uses)
  const [drawerGuest, setDrawerGuest] = useState<PmsCockpitItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const blockedRooms = useMemo(
    () => board?.rooms.filter((r) => r.blockings.length > 0).length ?? 0,
    [board?.rooms],
  );
  const stayBlocks = useMemo(
    () => board?.rooms.reduce((sum, r) => sum + r.blocks.length, 0) ?? 0,
    [board?.rooms],
  );

  // Payment breakdown for KPI
  const paymentStats = useMemo(() => {
    if (!board) return { paid: 0, open: 0 };
    let paid = 0, open = 0;
    for (const room of board.rooms) {
      for (const b of room.blocks) {
        const p = isPaymentPaid(b);
        if (p === true) paid++;
        else if (p === false) open++;
      }
    }
    return { paid, open };
  }, [board]);

  const openPayments = useCallback(
    (reservationId: number) => {
      setSelectedReservationId(String(reservationId));
      openPanel({
        type: "payments",
        data: { reservationId: String(reservationId) },
        title: "Payments",
      });
    },
    [openPanel, setSelectedReservationId],
  );

  const handleBlockStay = useCallback(
    (block: HotelRoomBoardBlock) => {
      if (block.reservation_id === null) return;
      setSelectedReservationId(String(block.reservation_id));
      if (block.room_id) setSelectedRoomId(String(block.room_id));

      // Map the board block into the PmsCockpitItem shape the drawer expects
      const guest: PmsCockpitItem = {
        reservation_id: block.reservation_id,
        booking_id: block.booking_id ?? "",
        guest_name: block.guest_name ?? "",
        status: block.status ?? "",
        room: block.room_number,
        room_type_label: block.room_type_name,
        check_in: block.check_in,
        check_out: block.check_out,
        adults: block.adults,
        children: block.children,
        total_amount: 0,
        payment_status: block.payment_status,
        folio_status: null,
        stay_status: null,
      };
      setDrawerGuest(guest);
      setDrawerOpen(true);
    },
    [setSelectedReservationId, setSelectedRoomId],
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
    <div className="space-y-5 animate-in fade-in duration-700">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-[#e8d9b0] tracking-tight">
            Belegungsplan
          </h1>
          <p className="text-white/35 mt-1 text-[13px]">
            Live-Belegungskalender · Zimmervergabe · Blockierungen
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWindow("previous")}
            className="rounded-xl p-2 bg-white/[0.06] hover:bg-white/[0.10] text-white/50 hover:text-white transition-colors border border-white/[0.05]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-xl border border-white/[0.07] bg-white/[0.05] px-3 py-2 text-sm text-[#e8d9b0] outline-none focus:ring-2 focus:ring-[#c8a951]/25 transition-shadow"
          />

          <button
            type="button"
            onClick={() => shiftWindow("next")}
            className="rounded-xl p-2 bg-white/[0.06] hover:bg-white/[0.10] text-white/50 hover:text-white transition-colors border border-white/[0.05]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1 ml-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.05]">
            {[7, 14, 21, 30].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDays(n)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-bold transition-all",
                  days === n
                    ? "bg-[#c8a951] text-[#0f1f14] shadow-sm"
                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.06]",
                )}
              >
                {n}T
              </button>
            ))}
          </div>

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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

        {/* Zimmer gesamt */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a3d2b] via-[#142e20] to-[#0f2318] p-5 border border-white/[0.04]">
          <div className="flex items-start justify-between mb-3">
            <div className="rounded-xl p-2 bg-[#c8a951]/10 border border-[#c8a951]/15">
              <BedDouble className="h-5 w-5 text-[#c8a951]" />
            </div>
            <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold">Gesamt</span>
          </div>
          <p className="text-[40px] font-black text-white leading-none">{board?.rooms.length ?? 0}</p>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mt-2 font-semibold">Zimmer</p>
        </div>

        {/* Aufenthalte */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a2e5f] via-[#132244] to-[#0d1833] p-5 border border-white/[0.04]">
          <div className="flex items-start justify-between mb-3">
            <div className="rounded-xl p-2 bg-sky-400/10 border border-sky-400/15">
              <Users className="h-5 w-5 text-sky-400" />
            </div>
            <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold">Aktiv</span>
          </div>
          <p className="text-[40px] font-black text-white leading-none">{stayBlocks}</p>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mt-2 font-semibold">Aufenthalte</p>
        </div>

        {/* Bezahlt / Offen — replaces old "Gesperrt" slot with payment overview */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a3828] via-[#122a1e] to-[#0d1f16] p-5 border border-white/[0.04]">
          <div className="flex items-start justify-between mb-3">
            <div className="rounded-xl p-2 bg-emerald-400/10 border border-emerald-400/15">
              <Circle className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold">Zahlung</span>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-[40px] font-black text-emerald-300 leading-none">{paymentStats.paid}</p>
            <span className="text-white/20 text-xl font-light mb-1">/</span>
            <p className="text-[40px] font-black text-rose-400 leading-none">{paymentStats.open}</p>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-[9px] text-emerald-400/70 font-semibold uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Bezahlt
            </span>
            <span className="flex items-center gap-1 text-[9px] text-rose-400/70 font-semibold uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Offen
            </span>
          </div>
        </div>

        {/* Nicht zugewiesen / Gesperrt */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#3d1f0d] via-[#2a1508] to-[#1f0e05] p-5 border border-white/[0.04]">
          <div className="flex items-start justify-between mb-3">
            <div className="rounded-xl p-2 bg-amber-400/10 border border-amber-400/15">
              <AlertCircle className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex flex-col items-end gap-0.5">
              {blockedRooms > 0 && (
                <span className="text-[9px] bg-rose-500/20 text-rose-300 rounded-full px-1.5 py-0.5 font-bold">
                  {blockedRooms} gesperrt
                </span>
              )}
            </div>
          </div>
          <p className="text-[40px] font-black text-white leading-none">{board?.unassigned_blocks.length ?? 0}</p>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mt-2 font-semibold">Nicht zugewiesen</p>
        </div>
      </div>

      {/* ── Status Legend ──────────────────────────────────────────────────── */}
      <StatusLegend />

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
        <Card className="bg-[#0d1b11] border border-white/[0.05] overflow-hidden shadow-none">
          <CardHeader className="border-b border-white/[0.05] bg-gradient-to-r from-[#0a1610] via-[#0f2318] to-[#1a3d2b] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-[15px] font-editorial text-[#e8d9b0] tracking-tight">
                Timeline
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftWindow("previous")}
                  className="rounded-xl bg-white/[0.06] hover:bg-white/[0.12] px-3 py-1.5 text-[11px] font-bold text-white/60 hover:text-white transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="h-3 w-3" /> Zurück
                </button>
                <button
                  type="button"
                  onClick={() => void boardQuery.refetch()}
                  className="rounded-xl bg-white/[0.06] hover:bg-white/[0.12] px-3 py-1.5 text-[11px] font-bold text-white/60 hover:text-white transition-colors"
                >
                  ↺ Neu laden
                </button>
                <button
                  type="button"
                  onClick={() => shiftWindow("next")}
                  className="rounded-xl bg-white/[0.06] hover:bg-white/[0.12] px-3 py-1.5 text-[11px] font-bold text-white/60 hover:text-white transition-colors flex items-center gap-1"
                >
                  Weiter <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {boardQuery.isLoading && !board ? (
              <div className="p-8 flex items-center gap-3 text-white/30">
                <div className="h-4 w-4 rounded-full border-2 border-[#c8a951]/30 border-t-[#c8a951] animate-spin" />
                <p className="text-sm">Belegungsplan wird geladen…</p>
              </div>
            ) : board ? (
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${200 + board.dates.length * 56}px` }}>

                  {/* Date header row */}
                  <div
                    className="grid border-b border-white/[0.05] bg-[#0a1610]"
                    style={{ gridTemplateColumns: `200px minmax(0,1fr)` }}
                  >
                    <div className="px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-[#c8a951]/50">
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
                              "px-0.5 py-2 text-center text-[9px] font-bold border-r border-white/[0.03] last:border-r-0",
                              today
                                ? "bg-[#c8a951]/15 text-[#c8a951]"
                                : weekend
                                  ? "text-white/35 bg-white/[0.015]"
                                  : "text-white/30",
                            )}
                          >
                            {formatDayLabel(dateStr)}
                            {today && (
                              <span className="block w-1 h-1 rounded-full bg-[#c8a951] mx-auto mt-0.5" />
                            )}
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
        <div className="space-y-4">

          {/* Reservation summary rail */}
          <ReservationSummaryRail
            reservationId={selectedReservationId}
            emptyTitle="Keine Reservierung ausgewählt"
            emptyDescription="Buchungsblock im Kalender anklicken, um Details anzuzeigen."
          />

          {/* Unassigned stays */}
          {board && board.unassigned_blocks.length > 0 && (
            <Card className="bg-gradient-to-b from-[#0f1f14] to-[#0d1b11] border border-white/[0.05] shadow-none">
              <CardHeader className="border-b border-white/[0.05] px-5 py-3">
                <CardTitle className="text-sm font-editorial text-[#e8d9b0]">
                  Nicht zugewiesen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3">
                {board.unassigned_blocks.map((block) => (
                  <button
                    key={`${block.booking_id}-${block.start_offset}`}
                    type="button"
                    onClick={() =>
                      block.reservation_id &&
                      setSelectedReservationId(String(block.reservation_id))
                    }
                    className="w-full rounded-xl border border-white/[0.05] bg-white/[0.025] p-3 text-left hover:bg-white/[0.05] hover:border-white/[0.08] transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-[#e8d9b0] truncate">
                        {block.guest_name || block.booking_id}
                      </p>
                      <PaymentDot paid={isPaymentPaid(block)} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-white/35">
                      {block.check_in} – {block.check_out} · {block.room_type_name || "Kein Zimmertyp"}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Create room blocking */}
          <Card className="bg-gradient-to-b from-[#0f1f14] to-[#0c1810] border border-white/[0.05] shadow-none">
            <CardHeader className="border-b border-white/[0.05] px-5 py-3">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-rose-400/70" />
                <CardTitle className="text-sm font-editorial text-[#e8d9b0]">
                  Zimmer sperren
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <form className="space-y-3" onSubmit={handleCreateBlocking}>
                <div>
                  <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-[#c8a951]/70">
                    Zimmer
                  </label>
                  <select
                    required
                    value={blockingForm.room_id}
                    onChange={(e) => setBlockingForm((p) => ({ ...p, room_id: e.target.value }))}
                    className="w-full rounded-xl border border-[#3a7d52]/20 bg-[#1a3d2b]/25 px-3 py-2 text-sm text-[#e8d9b0] outline-none focus:ring-2 focus:ring-[#c8a951]/20 transition-shadow"
                  >
                    <option value="">Zimmer wählen…</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.number} · {r.room_type_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["start_date", "end_date"] as const).map((field) => (
                    <div key={field}>
                      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-[#c8a951]/70">
                        {field === "start_date" ? "Von" : "Bis"}
                      </label>
                      <input
                        required
                        type="date"
                        value={blockingForm[field]}
                        onChange={(e) =>
                          setBlockingForm((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="w-full rounded-xl border border-[#3a7d52]/20 bg-[#1a3d2b]/25 px-3 py-2 text-sm text-[#e8d9b0] outline-none focus:ring-2 focus:ring-[#c8a951]/20 transition-shadow"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-[#c8a951]/70">
                    Grund
                  </label>
                  <input
                    required
                    value={blockingForm.reason}
                    onChange={(e) => setBlockingForm((p) => ({ ...p, reason: e.target.value }))}
                    placeholder="Wartung, Reinigung, VIP…"
                    className="w-full rounded-xl border border-[#3a7d52]/20 bg-[#1a3d2b]/25 px-3 py-2 text-sm text-[#e8d9b0] placeholder:text-white/15 outline-none focus:ring-2 focus:ring-[#c8a951]/20 transition-shadow"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-[#c8a951]/70">
                    Notizen
                  </label>
                  <textarea
                    rows={2}
                    value={blockingForm.notes}
                    onChange={(e) => setBlockingForm((p) => ({ ...p, notes: e.target.value }))}
                    className="w-full resize-none rounded-xl border border-[#3a7d52]/20 bg-[#1a3d2b]/25 px-3 py-2 text-sm text-[#e8d9b0] placeholder:text-white/15 outline-none focus:ring-2 focus:ring-[#c8a951]/20 transition-shadow"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-gradient-to-r from-[#c8a951] via-[#b89840] to-[#a8893a] px-4 py-2.5 text-sm font-black text-[#0f1f14] hover:opacity-90 transition-opacity disabled:opacity-50 tracking-wide"
                >
                  {saving ? "Speichern…" : "Sperre anlegen"}
                </button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Guest Quick Actions Drawer (same as Front Desk) ──────────────── */}
      <GuestQuickActionsDrawer
        guest={drawerGuest}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenPayment={() => {
          if (drawerGuest) openPayments(drawerGuest.reservation_id);
        }}
      />
    </div>
  );
}
