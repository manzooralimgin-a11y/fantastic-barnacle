"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Zap } from "lucide-react";
import {
  defaultHotelPropertyId,
  fetchHotelRoomTypes,
  type HotelRoomTypeOption,
} from "@/lib/hotel-room-types";

type RoomType = { id: string; name: string; base_rate: number; current_rate: number; occupancy: number; suggested_rate: number };

const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });

export default function RatesPage() {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);

  useEffect(() => {
    fetchHotelRoomTypes(defaultHotelPropertyId)
      .then((response) => {
        setRoomTypes(
          response.map((roomType: HotelRoomTypeOption) => ({
            id: String(roomType.id),
            name: roomType.name,
            base_rate: roomType.base_price,
            current_rate: roomType.base_price,
            occupancy: roomType.room_count || 0,
            suggested_rate: roomType.base_price,
          })),
        );
      })
      .catch((error) => {
        console.error("Failed to load hotel room rates", error);
      });
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Rate Manager</h1><p className="text-foreground-muted mt-1">Room pricing, rate plans, and yield management</p></div>
        <button className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 self-start"><Zap className="w-4 h-4" /> Update Rates</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {roomTypes.map(r => (
          <Card key={r.id} className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-6 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{r.name}</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-editorial font-bold text-foreground">€{r.current_rate}</h3>
                <span className="text-xs text-foreground-muted">/ night</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-foreground-muted">Base: €{r.base_rate}</span>
                <span className="text-foreground-muted">Inventory: {r.occupancy} rooms</span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="w-3 h-3 text-primary" />
                <span className="text-primary font-medium">Suggested: €{r.suggested_rate}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
        <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
          <CardTitle className="text-lg font-editorial text-foreground">7-Day Rate Calendar</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
              <tr>
                <th className="px-6 py-4 text-left">Room Type</th>
                {days.map(d => (<th key={d.toISOString()} className="px-4 py-4 text-center">{d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric" })}</th>))}
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {roomTypes.map(r => (
                <tr key={r.id} className="hover:bg-foreground/[0.01] transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">{r.name}</td>
                  {days.map((d, i) => {
                    const variation = Math.round(r.current_rate * (1 + (Math.sin(i * 1.5) * 0.1)));
                    return (<td key={d.toISOString()} className="px-4 py-4 text-center font-mono text-foreground-muted">€{variation}</td>);
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
