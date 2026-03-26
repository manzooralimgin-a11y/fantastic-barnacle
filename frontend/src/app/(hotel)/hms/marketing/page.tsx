"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, MailOpen, Target, Euro, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Campaign = { id: string; name: string; type: "Email" | "SMS" | "Social" | "Loyalty"; status: "active" | "draft" | "completed"; audience: number; sent: number; opens: number; conversions: number };

const fallbackCampaigns: Campaign[] = [
  { id: "1", name: "Spring Weekend Getaway", type: "Email", status: "active", audience: 2400, sent: 2380, opens: 998, conversions: 86 },
  { id: "2", name: "Loyalty Double Points", type: "Loyalty", status: "active", audience: 890, sent: 890, opens: 534, conversions: 120 },
  { id: "3", name: "Easter Family Package", type: "Email", status: "draft", audience: 3200, sent: 0, opens: 0, conversions: 0 },
  { id: "4", name: "Business Travel Promo", type: "SMS", status: "active", audience: 560, sent: 558, opens: 412, conversions: 34 },
  { id: "5", name: "Valentine's Dinner", type: "Social", status: "completed", audience: 5000, sent: 5000, opens: 2100, conversions: 180 },
];

const statusColors: Record<string, string> = { active: "bg-emerald-500/10 text-emerald-600", draft: "bg-foreground/10 text-foreground-muted", completed: "bg-primary/10 text-primary" };

export default function MarketingPage() {
  const [campaigns] = useState<Campaign[]>(fallbackCampaigns);
  const stats = [
    { label: "Active Campaigns", value: campaigns.filter(c => c.status === "active").length, icon: Megaphone },
    { label: "Email Open Rate", value: "42%", icon: MailOpen },
    { label: "Conversion Rate", value: "8.5%", icon: Target },
    { label: "Revenue Impact", value: "€4,200", icon: Euro },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Marketing</h1><p className="text-foreground-muted mt-1">Campaigns, promotions, and guest engagement</p></div>
        <button className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 self-start"><Plus className="w-4 h-4" /> New Campaign</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none"><CardContent className="p-6"><div className="flex items-center justify-between mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p><div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div></div><h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3></CardContent></Card>
        ))}
      </div>
      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden"><CardContent className="p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
            <tr><th className="px-6 py-4">Campaign</th><th className="px-6 py-4">Type</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Audience</th><th className="px-6 py-4">Sent</th><th className="px-6 py-4">Opens</th><th className="px-6 py-4">Conversions</th></tr>
          </thead>
          <tbody className="divide-y divide-foreground/10">
            {campaigns.map(c => (
              <tr key={c.id} className="hover:bg-foreground/[0.01] transition-colors">
                <td className="px-6 py-4 font-medium text-foreground">{c.name}</td>
                <td className="px-6 py-4 text-foreground-muted">{c.type}</td>
                <td className="px-6 py-4"><Badge variant="secondary" className={cn("capitalize text-[10px] font-bold border-transparent rounded-full", statusColors[c.status])}>{c.status}</Badge></td>
                <td className="px-6 py-4 font-mono text-foreground-muted">{c.audience.toLocaleString()}</td>
                <td className="px-6 py-4 font-mono text-foreground-muted">{c.sent.toLocaleString()}</td>
                <td className="px-6 py-4 font-mono text-foreground-muted">{c.opens.toLocaleString()}</td>
                <td className="px-6 py-4 font-mono text-foreground">{c.conversions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
