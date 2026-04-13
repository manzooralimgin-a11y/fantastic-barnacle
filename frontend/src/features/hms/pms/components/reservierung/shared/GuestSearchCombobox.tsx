"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchGuests, type GuestSearchResult } from "@/features/hms/pms/api/inventory";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";

type Props = {
  value: string;
  placeholder?: string;
  propertyId?: number;
  onSelect: (guest: GuestSearchResult) => void;
  onClear: () => void;
  className?: string;
};

export function GuestSearchCombobox({
  value,
  placeholder = "Gast suchen…",
  propertyId = defaultHotelPropertyId,
  onSelect,
  onClear,
  className,
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GuestSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes (e.g. when cleared by parent)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    setOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const hits = await searchGuests(q, propertyId);
        setResults(hits);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleSelect(guest: GuestSearchResult) {
    setQuery(guest.name);
    setResults([]);
    setOpen(false);
    onSelect(guest);
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setOpen(false);
    onClear();
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-3.5 w-3.5 text-foreground-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => query && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-foreground/10 bg-card pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-foreground-muted outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
        />
        {(loading) && (
          <Loader2 className="absolute right-3 h-3.5 w-3.5 animate-spin text-foreground-muted" />
        )}
        {(!loading && query) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 rounded-full text-foreground-muted hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-foreground/10 bg-card shadow-lg">
          {results.map((guest) => (
            <li key={guest.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                onClick={() => handleSelect(guest)}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-foreground/[0.04] transition-colors"
              >
                <span className="font-medium text-foreground">{guest.name}</span>
                {guest.email && (
                  <span className="ml-2 text-xs text-foreground-muted">{guest.email}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && query.trim().length > 1 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-foreground/10 bg-card px-4 py-3 text-sm text-foreground-muted shadow-lg">
          Kein Gast gefunden — neuen Eintrag manuell anlegen.
        </div>
      )}
    </div>
  );
}
