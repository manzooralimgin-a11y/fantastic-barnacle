"use client";

import type { HotelRoomTypeOption } from "@/lib/hotel-room-types";
import type { ReservationFormValues } from "@/features/hms/pms/schemas/reservation";

type Props = {
  values: ReservationFormValues;
  onChange: (next: ReservationFormValues) => void;
  roomTypes: HotelRoomTypeOption[];
};

export function ReservationForm({ values, onChange, roomTypes }: Props) {
  function update<K extends keyof ReservationFormValues>(key: K, value: ReservationFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Anrede / Title
          </label>
          <select
            value={values.anrede}
            onChange={(event) => update("anrede", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">-- Bitte wählen --</option>
            <option value="Herr">Herr</option>
            <option value="Frau">Frau</option>
            <option value="Herr Dr.">Herr Dr.</option>
            <option value="Frau Dr.">Frau Dr.</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Guest Name
          </label>
          <input
            value={values.guest_name}
            onChange={(event) => update("guest_name", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Phone
          </label>
          <input
            value={values.phone}
            onChange={(event) => update("phone", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Room Type
          </label>
          <select
            value={values.room_type}
            onChange={(event) => update("room_type", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          >
            {roomTypes.map((roomType) => (
              <option key={roomType.id} value={roomType.name}>
                {roomType.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Room
          </label>
          <input
            value={values.room}
            onChange={(event) => update("room", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div />
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Check In
          </label>
          <input
            type="date"
            value={values.check_in}
            onChange={(event) => update("check_in", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Check Out
          </label>
          <input
            type="date"
            value={values.check_out}
            onChange={(event) => update("check_out", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Adults
          </label>
          <input
            type="number"
            min="1"
            value={values.adults}
            onChange={(event) => update("adults", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Children
          </label>
          <input
            type="number"
            min="0"
            value={values.children}
            onChange={(event) => update("children", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Payment Method
          </label>
          <input
            value={values.zahlungs_methode}
            onChange={(event) => update("zahlungs_methode", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Payment Status
          </label>
          <select
            value={values.zahlungs_status}
            onChange={(event) => update("zahlungs_status", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="offen">Offen</option>
            <option value="bezahlt">Bezahlt</option>
            <option value="teilbezahlt">Teilbezahlt</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">
            Special Requests
          </label>
          <textarea
            value={values.special_requests}
            onChange={(event) => update("special_requests", event.target.value)}
            className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 min-h-24"
          />
        </div>
      </div>
    </div>
  );
}

