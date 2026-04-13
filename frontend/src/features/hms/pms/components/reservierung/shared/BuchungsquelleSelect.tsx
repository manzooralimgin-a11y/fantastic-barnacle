"use client";

const SOURCES = [
  { value: "", label: "— Quelle wählen —" },
  { value: "Walk-In", label: "Walk-In" },
  { value: "Telefon", label: "Telefon" },
  { value: "E-Mail", label: "E-Mail" },
  { value: "Booking.com", label: "Booking.com" },
  { value: "Expedia", label: "Expedia" },
  { value: "Airbnb", label: "Airbnb" },
  { value: "Direkt Website", label: "Direkt Website" },
  { value: "Reisebüro", label: "Reisebüro" },
  { value: "Stammgast", label: "Stammgast" },
  { value: "Sonstiges", label: "Sonstiges" },
];

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function BuchungsquelleSelect({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
    >
      {SOURCES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
