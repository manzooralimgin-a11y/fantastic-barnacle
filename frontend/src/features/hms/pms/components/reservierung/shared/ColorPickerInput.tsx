"use client";

import { cn } from "@/lib/utils";

const SWATCHES = [
  { label: "Keine", hex: "" },
  { label: "Blau", hex: "#3B82F6" },
  { label: "Grün", hex: "#22C55E" },
  { label: "Gelb", hex: "#EAB308" },
  { label: "Orange", hex: "#F97316" },
  { label: "Rot", hex: "#EF4444" },
  { label: "Lila", hex: "#A855F7" },
  { label: "Pink", hex: "#EC4899" },
  { label: "Grau", hex: "#6B7280" },
];

type Props = {
  value: string;
  onChange: (hex: string) => void;
};

export function ColorPickerInput({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {SWATCHES.map((swatch) => (
        <button
          key={swatch.hex}
          type="button"
          title={swatch.label}
          onClick={() => onChange(swatch.hex)}
          className={cn(
            "h-6 w-6 rounded-full border-2 transition-all",
            value === swatch.hex
              ? "border-foreground scale-110 shadow-sm"
              : "border-foreground/20 hover:border-foreground/50",
          )}
          style={{
            background: swatch.hex || "transparent",
            backgroundImage: swatch.hex
              ? undefined
              : "repeating-linear-gradient(45deg, #ccc 0, #ccc 2px, transparent 0, transparent 50%)",
            backgroundSize: swatch.hex ? undefined : "6px 6px",
          }}
        >
          <span className="sr-only">{swatch.label}</span>
        </button>
      ))}
    </div>
  );
}
