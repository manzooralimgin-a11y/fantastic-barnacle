"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, BarChart3, Percent, Euro } from "lucide-react";
import api from "@/lib/api";
import {
  defaultHotelPropertyId,
  fetchHotelRoomTypes,
  type HotelRoomTypeOption,
} from "@/lib/hotel-room-types";

const stats = [
  { label: "RevPAR", value: "€89", icon: TrendingUp, trend: "+5% vs LW" },
  { label: "ADR", value: "€125", icon: Euro, trend: "+3% vs LW" },
  { label: "Occupancy", value: "71%", icon: Percent, trend: "+8% vs LW" },
  { label: "GOP Margin", value: "34%", icon: BarChart3, trend: "+2% vs LW" },
];

type TopRoomType = {
  type: string;
  bookings: number;
  revenue: number;
  adr: number;
  inventory: number;
};

type Reservation = {
  room_type: string;
  total_amount?: number;
};

const guestOrigins = [
  { country: "Germany", guests: 520, revenue: 45000, avg_stay: 2.3 },
  { country: "Netherlands", guests: 85, revenue: 8500, avg_stay: 2.8 },
  { country: "United Kingdom", guests: 62, revenue: 7200, avg_stay: 3.1 },
  { country: "France", guests: 45, revenue: 5400, avg_stay: 2.5 },
  { country: "Switzerland", guests: 38, revenue: 4800, avg_stay: 2.0 },
];

export default function AnalyticsPage() {
  const [topRoomTypes, setTopRoomTypes] = useState<TopRoomType[]>([]);

  useEffect(() => {
    Promise.all([
      fetchHotelRoomTypes(defaultHotelPropertyId),
      api.get<Reservation[]>("/hms/reservations"),
    ])
      .then(([roomTypes, reservationsResponse]) => {
        const reservations = reservationsResponse.data || [];
        const nextTopRoomTypes = roomTypes.map((roomType: HotelRoomTypeOption) => {
          const matchingReservations = reservations.filter(
            (reservation) => reservation.room_type === roomType.name,
          );
          const revenue = matchingReservations.reduce(
            (sum, reservation) => sum + Number(reservation.total_amount || 0),
            0,
          );
          return {
            type: roomType.name,
            bookings: matchingReservations.length,
            revenue,
            adr: roomType.base_price,
            inventory: roomType.room_count || 0,
          };
        });
        setTopRoomTypes(nextTopRoomTypes);
      })
      .catch((error) => {
        console.error("Failed to load hotel analytics room types", error);
      });
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div><h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Analytics</h1><p className="text-foreground-muted mt-1">Hotel performance metrics and insights</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon, trend }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none"><CardContent className="p-6"><div className="flex items-center justify-between mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p><div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div></div><div className="flex items-baseline gap-2"><h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3><span className="text-[10px] font-medium text-foreground/60">{trend}</span></div></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5"><CardTitle className="text-lg font-editorial text-foreground">Top Room Types</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left text-sm"><thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]"><tr><th className="px-6 py-4">Type</th><th className="px-6 py-4">Bookings</th><th className="px-6 py-4">Revenue</th><th className="px-6 py-4">ADR</th><th className="px-6 py-4">Rooms</th></tr></thead>
              <tbody className="divide-y divide-foreground/10">{topRoomTypes.map(r => (<tr key={r.type} className="hover:bg-foreground/[0.01]"><td className="px-6 py-4 font-medium text-foreground">{r.type}</td><td className="px-6 py-4 font-mono text-foreground-muted">{r.bookings}</td><td className="px-6 py-4 font-mono text-foreground">€{r.revenue.toLocaleString()}</td><td className="px-6 py-4 font-mono text-foreground-muted">€{r.adr}</td><td className="px-6 py-4 text-foreground-muted">{r.inventory}</td></tr>))}</tbody>
            </table>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5"><CardTitle className="text-lg font-editorial text-foreground">Guest Origins</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left text-sm"><thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]"><tr><th className="px-6 py-4">Country</th><th className="px-6 py-4">Guests</th><th className="px-6 py-4">Revenue</th><th className="px-6 py-4">Avg Stay</th></tr></thead>
              <tbody className="divide-y divide-foreground/10">{guestOrigins.map(g => (<tr key={g.country} className="hover:bg-foreground/[0.01]"><td className="px-6 py-4 font-medium text-foreground">{g.country}</td><td className="px-6 py-4 font-mono text-foreground-muted">{g.guests}</td><td className="px-6 py-4 font-mono text-foreground">€{g.revenue.toLocaleString()}</td><td className="px-6 py-4 text-foreground-muted">{g.avg_stay} nights</td></tr>))}</tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
