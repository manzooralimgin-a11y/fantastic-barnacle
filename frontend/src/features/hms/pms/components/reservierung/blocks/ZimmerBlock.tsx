"use client";

/**
 * ZimmerBlock — Tickets 3.1
 *
 * Date pickers, pax counters, room-category dropdown, exact room dropdown,
 * and Zimmerfixierung checkbox. When check-in/check-out or pax changes the
 * component fetches available rooms from POST /hms/pms/inventory/availability
 * and rebuilds the room dropdowns. The roomTypeId change also triggers the
 * RateBlock re-fetch via shared store state.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReservierungStore } from "@/features/hms/pms/stores/reservierungStore";
import { fetchAvailability, type AvailableRoom } from "@/features/hms/pms/api/inventory";

function BlockLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-1.5">
      {children}
    </p>
  );
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-shadow",
        props.className,
      )}
    />
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-shadow appearance-none",
        props.className,
      )}
    />
  );
}

function PaxStepper({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <BlockLabel>{label}</BlockLabel>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-foreground/10 bg-card text-foreground-muted hover:text-foreground hover:border-foreground/20 transition-colors text-lg font-light"
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-semibold text-foreground">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-foreground/10 bg-card text-foreground-muted hover:text-foreground hover:border-foreground/20 transition-colors text-lg font-light"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function ZimmerBlock() {
  const checkIn = useReservierungStore((s) => s.checkIn);
  const checkOut = useReservierungStore((s) => s.checkOut);
  const paxAdults = useReservierungStore((s) => s.paxAdults);
  const paxChildren = useReservierungStore((s) => s.paxChildren);
  const roomTypeId = useReservierungStore((s) => s.roomTypeId);
  const roomTypeName = useReservierungStore((s) => s.roomTypeName);
  const roomId = useReservierungStore((s) => s.roomId);
  const roomFixed = useReservierungStore((s) => s.roomFixed);
  const totalPax = useReservierungStore((s) => s.totalPax);
  const nights = useReservierungStore((s) => s.nights);

  const setCheckIn = useReservierungStore((s) => s.setCheckIn);
  const setCheckOut = useReservierungStore((s) => s.setCheckOut);
  const setPaxAdults = useReservierungStore((s) => s.setPaxAdults);
  const setPaxChildren = useReservierungStore((s) => s.setPaxChildren);
  const setRoomType = useReservierungStore((s) => s.setRoomType);
  const setRoom = useReservierungStore((s) => s.setRoom);
  const setRoomFixed = useReservierungStore((s) => s.setRoomFixed);

  const pax = totalPax();
  const nightCount = nights();

  // Fetch available rooms whenever key inputs change
  const { data: availability, isFetching } = useQuery({
    queryKey: ["pms-availability", checkIn, checkOut, pax],
    queryFn: () => fetchAvailability(checkIn, checkOut, pax),
    enabled: !!checkIn && !!checkOut && nightCount > 0 && pax > 0,
    staleTime: 30_000,
  });

  // Build room-type options from the available rooms
  const roomTypeOptions = useMemo(() => {
    if (!availability?.rooms) return [];
    const seen = new Map<number, string>();
    for (const r of availability.rooms) {
      if (!seen.has(r.room_type_id)) seen.set(r.room_type_id, r.room_type_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [availability]);

  // Rooms that match the selected type
  const roomOptions = useMemo<AvailableRoom[]>(() => {
    if (!availability?.rooms || !roomTypeId) return [];
    return availability.rooms.filter((r) => r.room_type_id === roomTypeId);
  }, [availability, roomTypeId]);

  // Auto-select first type if current selection no longer available
  useEffect(() => {
    if (isFetching) return;
    if (!availability?.rooms) return;
    const stillAvailable = roomTypeId
      ? roomTypeOptions.some((rt) => rt.id === roomTypeId)
      : false;
    if (!stillAvailable && roomTypeOptions.length > 0) {
      const first = roomTypeOptions[0];
      setRoomType(first.id, first.name);
    }
  }, [roomTypeOptions, isFetching]);  // eslint-disable-line react-hooks/exhaustive-deps

  function handleRoomTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = Number(e.target.value);
    const name = roomTypeOptions.find((rt) => rt.id === id)?.name ?? "";
    setRoomType(id || null, name);
  }

  function handleRoomChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = Number(e.target.value);
    const room = roomOptions.find((r) => r.room_id === id);
    setRoom(id || null, room?.room_number ?? "");
  }

  return (
    <section className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Zimmer</h3>
        {nightCount > 0 && (
          <span className="text-xs text-foreground-muted">
            {nightCount} {nightCount === 1 ? "Nacht" : "Nächte"}
          </span>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <BlockLabel>Anreise</BlockLabel>
          <FieldInput
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div>
          <BlockLabel>Abreise</BlockLabel>
          <FieldInput
            type="date"
            value={checkOut}
            min={checkIn}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
      </div>

      {/* Pax */}
      <div className="grid grid-cols-2 gap-3">
        <PaxStepper label="Erwachsene" value={paxAdults} min={1} onChange={setPaxAdults} />
        <PaxStepper label="Kinder" value={paxChildren} min={0} onChange={setPaxChildren} />
      </div>

      {/* Room category */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <BlockLabel>Zimmerkategorie</BlockLabel>
          {isFetching && (
            <Loader2 className="h-3 w-3 animate-spin text-foreground-muted" />
          )}
        </div>
        <FieldSelect
          value={roomTypeId ?? ""}
          onChange={handleRoomTypeChange}
          disabled={isFetching}
        >
          <option value="">— Kategorie wählen —</option>
          {roomTypeOptions.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.name}
            </option>
          ))}
        </FieldSelect>
        {!isFetching && availability && roomTypeOptions.length === 0 && (
          <p className="mt-1.5 text-xs text-status-danger">
            Keine verfügbaren Zimmer für diesen Zeitraum / diese Personenzahl.
          </p>
        )}
      </div>

      {/* Exact room + Zimmerfixierung */}
      <div>
        <BlockLabel>Zimmer</BlockLabel>
        <div className="flex gap-2">
          <FieldSelect
            value={roomId ?? ""}
            onChange={handleRoomChange}
            disabled={!roomTypeId || roomOptions.length === 0 || roomFixed}
            className="flex-1"
          >
            <option value="">— Zimmer wählen —</option>
            {roomOptions.map((r) => (
              <option key={r.room_id} value={r.room_id}>
                {r.room_number}
                {r.floor != null ? ` (Etage ${r.floor})` : ""}
              </option>
            ))}
          </FieldSelect>

          {/* Zimmerfixierung toggle */}
          <button
            type="button"
            title={roomFixed ? "Zimmerfixierung aufheben" : "Zimmer fixieren"}
            onClick={() => setRoomFixed(!roomFixed)}
            className={cn(
              "flex items-center gap-1.5 px-3 rounded-xl border text-xs font-semibold transition-colors",
              roomFixed
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-foreground/10 bg-card text-foreground-muted hover:text-foreground",
            )}
          >
            {roomFixed ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <Unlock className="h-3.5 w-3.5" />
            )}
            Fix
          </button>
        </div>
      </div>
    </section>
  );
}
