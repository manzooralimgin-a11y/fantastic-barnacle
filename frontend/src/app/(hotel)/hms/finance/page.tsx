"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Euro, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const stats = [
  { label: "Revenue MTD", value: "€87,500", icon: Euro, trend: "+8% vs LM" },
  { label: "Expenses MTD", value: "€52,300", icon: TrendingDown, trend: "-3% vs LM" },
  { label: "Net Profit", value: "€35,200", icon: TrendingUp, trend: "+18% vs LM" },
  { label: "YoY Growth", value: "+12%", icon: BarChart3, trend: "On track" },
];

const transactions = [
  { date: "2026-03-17", description: "Room revenue - Booking.com", category: "Room Revenue", amount: 2450, type: "income" },
  { date: "2026-03-17", description: "Restaurant dinner service", category: "F&B Revenue", amount: 1280, type: "income" },
  { date: "2026-03-17", description: "Linen supplier payment", category: "Housekeeping", amount: -890, type: "expense" },
  { date: "2026-03-16", description: "Direct booking - Website", category: "Room Revenue", amount: 1580, type: "income" },
  { date: "2026-03-16", description: "Staff salaries (weekly)", category: "Payroll", amount: -8500, type: "expense" },
  { date: "2026-03-16", description: "Spa & wellness packages", category: "Ancillary", amount: 620, type: "income" },
  { date: "2026-03-15", description: "Energy bill - March", category: "Utilities", amount: -3200, type: "expense" },
  { date: "2026-03-15", description: "Conference room rental", category: "Events", amount: 950, type: "income" },
  { date: "2026-03-15", description: "Food & beverage supplies", category: "F&B Cost", amount: -2100, type: "expense" },
  { date: "2026-03-14", description: "Parking revenue", category: "Ancillary", amount: 340, type: "income" },
];

export default function FinancePage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div><h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Finance</h1><p className="text-foreground-muted mt-1">Revenue, expenses, and financial reporting</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon, trend }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none"><CardContent className="p-6"><div className="flex items-center justify-between mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p><div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div></div><div className="flex items-baseline gap-2"><h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3><span className="text-[10px] font-medium text-foreground/60">{trend}</span></div></CardContent></Card>
        ))}
      </div>
      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
        <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5"><CardTitle className="text-lg font-editorial text-foreground">Recent Transactions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]"><tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Description</th><th className="px-6 py-4">Category</th><th className="px-6 py-4 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-foreground/10">
              {transactions.map((t, i) => (
                <tr key={i} className="hover:bg-foreground/[0.01] transition-colors">
                  <td className="px-6 py-4 text-foreground-muted">{new Date(t.date).toLocaleDateString("de-DE")}</td>
                  <td className="px-6 py-4 font-medium text-foreground">{t.description}</td>
                  <td className="px-6 py-4 text-foreground-muted">{t.category}</td>
                  <td className={cn("px-6 py-4 text-right font-mono font-medium", t.type === "income" ? "text-emerald-600" : "text-red-500")}>{t.type === "income" ? "+" : ""}€{Math.abs(t.amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
