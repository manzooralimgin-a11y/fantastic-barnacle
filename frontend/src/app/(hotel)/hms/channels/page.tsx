"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, CalendarCheck, Euro, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

type Channel = { id: string; name: string; status: "connected" | "disconnected"; bookings_mtd: number; revenue_mtd: number; commission: number; last_sync: string };

const fallbackChannels: Channel[] = [
  { id: "1", name: "Booking.com", status: "connected", bookings_mtd: 45, revenue_mtd: 12500, commission: 15, last_sync: "2 min ago" },
  { id: "2", name: "Expedia", status: "connected", bookings_mtd: 18, revenue_mtd: 5400, commission: 18, last_sync: "5 min ago" },
  { id: "3", name: "HRS", status: "connected", bookings_mtd: 12, revenue_mtd: 3200, commission: 12, last_sync: "10 min ago" },
  { id: "4", name: "Direct Website", status: "connected", bookings_mtd: 32, revenue_mtd: 9800, commission: 0, last_sync: "Live" },
  { id: "5", name: "Airbnb", status: "disconnected", bookings_mtd: 0, revenue_mtd: 0, commission: 14, last_sync: "3 days ago" },
];

export default function ChannelsPage() {
  const [channels] = useState<Channel[]>(fallbackChannels);
  const stats = [
    { label: "Connected Channels", value: channels.filter(c => c.status === "connected").length, icon: Globe },
    { label: "Bookings Today", value: 7, icon: CalendarCheck },
    { label: "Revenue Today", value: "€3,200", icon: Euro },
    { label: "Avg. Commission", value: "12%", icon: Percent },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div><h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Distribution Channels</h1><p className="text-foreground-muted mt-1">OTA connections and channel management</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none"><CardContent className="p-6"><div className="flex items-center justify-between mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p><div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div></div><h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3></CardContent></Card>
        ))}
      </div>
      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden"><CardContent className="p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
            <tr><th className="px-6 py-4">Channel</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Bookings (MTD)</th><th className="px-6 py-4">Revenue (MTD)</th><th className="px-6 py-4">Commission</th><th className="px-6 py-4">Last Sync</th><th className="px-6 py-4 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-foreground/10">
            {channels.map(c => (
              <tr key={c.id} className="hover:bg-foreground/[0.01] transition-colors">
                <td className="px-6 py-4 font-medium text-foreground">{c.name}</td>
                <td className="px-6 py-4"><Badge variant="secondary" className={cn("text-[10px] font-bold border-transparent rounded-full", c.status === "connected" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600")}>{c.status}</Badge></td>
                <td className="px-6 py-4 font-mono text-foreground">{c.bookings_mtd}</td>
                <td className="px-6 py-4 font-mono text-foreground">€{c.revenue_mtd.toLocaleString()}</td>
                <td className="px-6 py-4 text-foreground-muted">{c.commission}%</td>
                <td className="px-6 py-4 text-foreground-muted">{c.last_sync}</td>
                <td className="px-6 py-4 text-right"><button className="text-xs font-medium text-primary hover:underline">{c.status === "connected" ? "Sync Now" : "Connect"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
