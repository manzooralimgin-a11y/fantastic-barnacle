"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Crown, RotateCcw, Star, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Guest = { id: string; name: string; email: string; phone: string; stays: number; last_visit: string; vip: boolean; tier: "Gold" | "Silver" | "Bronze" };

const fallbackGuests: Guest[] = [
  { id: "1", name: "Anna Bergmann", email: "anna@example.de", phone: "+49 170 5551234", stays: 12, last_visit: "2026-03-15", vip: true, tier: "Gold" },
  { id: "2", name: "Thomas Krause", email: "thomas@example.de", phone: "+49 171 5552345", stays: 5, last_visit: "2026-03-10", vip: false, tier: "Silver" },
  { id: "3", name: "Sophie Richter", email: "sophie@example.de", phone: "+49 172 5553456", stays: 3, last_visit: "2026-02-28", vip: false, tier: "Bronze" },
  { id: "4", name: "Markus Weber", email: "markus@example.de", phone: "+49 173 5554567", stays: 22, last_visit: "2026-03-17", vip: true, tier: "Gold" },
  { id: "5", name: "Klaus Fischer", email: "klaus@example.de", phone: "+49 174 5555678", stays: 8, last_visit: "2026-03-01", vip: false, tier: "Silver" },
  { id: "6", name: "Maria Schmidt", email: "maria@example.de", phone: "+49 175 5556789", stays: 1, last_visit: "2026-03-12", vip: false, tier: "Bronze" },
  { id: "7", name: "Lukas Braun", email: "lukas@example.de", phone: "+49 176 5557890", stays: 15, last_visit: "2026-03-05", vip: true, tier: "Gold" },
];

const tierColors: Record<string, string> = { Gold: "bg-primary/10 text-primary", Silver: "bg-foreground/10 text-foreground-muted", Bronze: "bg-orange-500/10 text-orange-600" };

export default function CRMPage() {
  const [guests] = useState<Guest[]>(fallbackGuests);
  const [search, setSearch] = useState("");
  const filtered = guests.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase()) || g.email.toLowerCase().includes(search.toLowerCase()));
  const stats = [
    { label: "Total Guests", value: "1,247", icon: Users },
    { label: "VIP Guests", value: guests.filter(g => g.vip).length, icon: Crown },
    { label: "Returning", value: guests.filter(g => g.stays > 1).length, icon: RotateCcw },
    { label: "Avg. Rating", value: "4.6", icon: Star },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div><h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Guest CRM</h1><p className="text-foreground-muted mt-1">Guest profiles, preferences, and history</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none"><CardContent className="p-6"><div className="flex items-center justify-between mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p><div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div></div><h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3></CardContent></Card>
        ))}
      </div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guests..." className="w-full bg-card border border-foreground/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" /></div>
      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden"><CardContent className="p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
            <tr><th className="px-6 py-4">Guest</th><th className="px-6 py-4">Phone</th><th className="px-6 py-4">Stays</th><th className="px-6 py-4">Last Visit</th><th className="px-6 py-4">VIP</th><th className="px-6 py-4">Tier</th><th className="px-6 py-4 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-foreground/10">
            {filtered.map(g => (
              <tr key={g.id} className="hover:bg-foreground/[0.01] transition-colors">
                <td className="px-6 py-4"><div className="font-medium text-foreground">{g.name}</div><div className="text-xs text-foreground-muted">{g.email}</div></td>
                <td className="px-6 py-4 text-foreground-muted">{g.phone}</td>
                <td className="px-6 py-4 font-mono text-foreground">{g.stays}</td>
                <td className="px-6 py-4 text-foreground-muted">{new Date(g.last_visit).toLocaleDateString("de-DE")}</td>
                <td className="px-6 py-4">{g.vip && <Crown className="w-4 h-4 text-primary" />}</td>
                <td className="px-6 py-4"><Badge variant="secondary" className={cn("text-[10px] font-bold border-transparent rounded-full", tierColors[g.tier])}>{g.tier}</Badge></td>
                <td className="px-6 py-4 text-right"><button className="text-xs font-medium text-primary hover:underline">View Profile</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
