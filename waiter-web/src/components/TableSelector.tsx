import type { WaiterTable } from "../lib/api";

interface Props {
  tables: WaiterTable[];
  value: string;
  onChange: (id: string) => void;
}

export function TableSelector({ tables, value, onChange }: Props) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <small className="hint">Table</small>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={tables.length === 0}
      >
        {tables.length === 0 && <option value="">— no tables —</option>}
        {tables.map((t) => (
          <option key={t.id} value={t.id}>
            #{t.number} · {t.seats} seats · {t.status}
          </option>
        ))}
      </select>
    </label>
  );
}
