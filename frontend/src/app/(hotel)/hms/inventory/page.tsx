"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, AlertTriangle, ShoppingCart, Euro } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; category: string; stock: number; min_level: number; unit: string; status: "ok" | "low" | "critical"; last_ordered: string };

const fallbackItems: Item[] = [
  { id: "1", name: "Bath Towels (Large)", category: "Linens", stock: 120, min_level: 50, unit: "pcs", status: "ok", last_ordered: "2026-03-10" },
  { id: "2", name: "Shampoo Bottles (50ml)", category: "Toiletries", stock: 15, min_level: 50, unit: "pcs", status: "critical", last_ordered: "2026-03-05" },
  { id: "3", name: "Pillow Cases", category: "Linens", stock: 45, min_level: 40, unit: "pcs", status: "low", last_ordered: "2026-03-08" },
  { id: "4", name: "All-Purpose Cleaner", category: "Cleaning", stock: 24, min_level: 10, unit: "bottles", status: "ok", last_ordered: "2026-03-12" },
  { id: "5", name: "Coffee Capsules", category: "F&B", stock: 8, min_level: 20, unit: "boxes", status: "critical", last_ordered: "2026-03-01" },
  { id: "6", name: "Hand Soap Refills", category: "Toiletries", stock: 32, min_level: 15, unit: "bottles", status: "ok", last_ordered: "2026-03-14" },
  { id: "7", name: "A4 Paper", category: "Office", stock: 18, min_level: 10, unit: "reams", status: "ok", last_ordered: "2026-02-28" },
  { id: "8", name: "Bed Sheets (Queen)", category: "Linens", stock: 28, min_level: 25, unit: "pcs", status: "low", last_ordered: "2026-03-11" },
  { id: "9", name: "Mini Bar Water", category: "F&B", stock: 200, min_level: 100, unit: "bottles", status: "ok", last_ordered: "2026-03-15" },
  { id: "10", name: "Toilet Paper Rolls", category: "Toiletries", stock: 60, min_level: 30, unit: "rolls", status: "ok", last_ordered: "2026-03-13" },
];

const statusColors: Record<string, string> = { ok: "bg-emerald-500/10 text-emerald-600", low: "bg-amber-500/10 text-amber-600", critical: "bg-red-500/10 text-red-600" };

export default function InventoryPage() {
  const [items] = useState<Item[]>(fallbackItems);
  const stats = [
    { label: "Total Items", value: items.length, icon: Package },
    { label: "Low Stock Alerts", value: items.filter(i => i.status !== "ok").length, icon: AlertTriangle },
    { label: "Orders Pending", value: 2, icon: ShoppingCart },
    { label: "Monthly Spend", value: "€12,450", icon: Euro },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div><h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Inventory</h1><p className="text-foreground-muted mt-1">Hotel supplies and stock management</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none"><CardContent className="p-6"><div className="flex items-center justify-between mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p><div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div></div><h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3></CardContent></Card>
        ))}
      </div>
      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden"><CardContent className="p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
            <tr><th className="px-6 py-4">Item</th><th className="px-6 py-4">Category</th><th className="px-6 py-4">Stock</th><th className="px-6 py-4">Min Level</th><th className="px-6 py-4">Unit</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Last Ordered</th><th className="px-6 py-4 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-foreground/10">
            {items.map(i => (
              <tr key={i.id} className="hover:bg-foreground/[0.01] transition-colors">
                <td className="px-6 py-4 font-medium text-foreground">{i.name}</td>
                <td className="px-6 py-4 text-foreground-muted">{i.category}</td>
                <td className="px-6 py-4 font-mono text-foreground">{i.stock}</td>
                <td className="px-6 py-4 font-mono text-foreground-muted">{i.min_level}</td>
                <td className="px-6 py-4 text-foreground-muted">{i.unit}</td>
                <td className="px-6 py-4"><Badge variant="secondary" className={cn("capitalize text-[10px] font-bold border-transparent rounded-full", statusColors[i.status])}>{i.status}</Badge></td>
                <td className="px-6 py-4 text-foreground-muted">{new Date(i.last_ordered).toLocaleDateString("de-DE")}</td>
                <td className="px-6 py-4 text-right">{i.status !== "ok" && <button className="text-xs font-medium text-primary hover:underline">Reorder</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
