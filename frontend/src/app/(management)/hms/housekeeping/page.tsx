"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, CheckCircle2, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Task = { id: string; room: string; type: string; priority: "urgent" | "normal" | "low"; assigned_to: string; status: "pending" | "in-progress" | "done" | "inspecting"; last_cleaned: string };

const fallbackTasks: Task[] = [
  { id: "1", room: "102", type: "Komfort", priority: "urgent", assigned_to: "Elena M.", status: "pending", last_cleaned: "2026-03-16" },
  { id: "2", room: "202", type: "Komfort Plus", priority: "normal", assigned_to: "Stefan K.", status: "in-progress", last_cleaned: "2026-03-16" },
  { id: "3", room: "301", type: "Suite", priority: "normal", assigned_to: "Elena M.", status: "in-progress", last_cleaned: "2026-03-15" },
  { id: "4", room: "105", type: "Komfort", priority: "normal", assigned_to: "Anna B.", status: "done", last_cleaned: "2026-03-17" },
  { id: "5", room: "303", type: "Komfort Plus", priority: "low", assigned_to: "Stefan K.", status: "done", last_cleaned: "2026-03-17" },
  { id: "6", room: "201", type: "Komfort Plus", priority: "normal", assigned_to: "Anna B.", status: "inspecting", last_cleaned: "2026-03-17" },
  { id: "7", room: "401", type: "Suite", priority: "urgent", assigned_to: "Elena M.", status: "pending", last_cleaned: "2026-03-14" },
  { id: "8", room: "104", type: "Komfort", priority: "low", assigned_to: "Stefan K.", status: "pending", last_cleaned: "2026-03-16" },
];

const priorityColors: Record<string, string> = { urgent: "bg-red-500/10 text-red-600", normal: "bg-primary/10 text-primary", low: "bg-foreground/10 text-foreground-muted" };
const statusColors: Record<string, string> = { pending: "bg-amber-500/10 text-amber-600", "in-progress": "bg-blue-500/10 text-blue-600", done: "bg-emerald-500/10 text-emerald-600", inspecting: "bg-purple-500/10 text-purple-600" };
const filterTabs = ["All", "Pending", "In Progress", "Completed"] as const;

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState<Task[]>(fallbackTasks);
  const [tab, setTab] = useState("All");

  const filtered = tasks.filter(t => {
    if (tab === "Pending") return t.status === "pending";
    if (tab === "In Progress") return t.status === "in-progress";
    if (tab === "Completed") return t.status === "done" || t.status === "inspecting";
    return true;
  });

  const stats = [
    { label: "Rooms to Clean", value: tasks.filter(t => t.status === "pending").length, icon: Sparkles },
    { label: "In Progress", value: tasks.filter(t => t.status === "in-progress").length, icon: Clock },
    { label: "Completed Today", value: tasks.filter(t => t.status === "done").length, icon: CheckCircle2 },
    { label: "Inspections", value: tasks.filter(t => t.status === "inspecting").length, icon: ClipboardCheck },
  ];

  const updateStatus = (id: string, status: Task["status"]) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Housekeeping</h1>
        <p className="text-foreground-muted mt-1">Room cleaning schedules and task management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p>
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div>
              </div>
              <h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex bg-card rounded-xl p-1 border border-foreground/10 w-fit">
        {filterTabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-colors", tab === t ? "bg-primary text-primary-foreground" : "text-foreground-muted hover:text-foreground")}>{t}</button>
        ))}
      </div>

      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
              <tr><th className="px-6 py-4">Room</th><th className="px-6 py-4">Type</th><th className="px-6 py-4">Priority</th><th className="px-6 py-4">Assigned</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Last Cleaned</th><th className="px-6 py-4 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-foreground/[0.01] transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-foreground">{t.room}</td>
                  <td className="px-6 py-4 text-foreground-muted">{t.type}</td>
                  <td className="px-6 py-4"><Badge variant="secondary" className={cn("capitalize text-[10px] font-bold border-transparent rounded-full", priorityColors[t.priority])}>{t.priority}</Badge></td>
                  <td className="px-6 py-4 text-foreground-muted">{t.assigned_to}</td>
                  <td className="px-6 py-4"><Badge variant="secondary" className={cn("capitalize text-[10px] font-bold border-transparent rounded-full", statusColors[t.status])}>{t.status.replace("-", " ")}</Badge></td>
                  <td className="px-6 py-4 text-foreground-muted">{new Date(t.last_cleaned).toLocaleDateString("de-DE")}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {t.status === "pending" && <button onClick={() => updateStatus(t.id, "in-progress")} className="text-xs font-medium text-primary hover:underline">Start</button>}
                      {t.status === "in-progress" && <button onClick={() => updateStatus(t.id, "done")} className="text-xs font-medium text-emerald-600 hover:underline">Complete</button>}
                      {t.status === "done" && <button onClick={() => updateStatus(t.id, "inspecting")} className="text-xs font-medium text-purple-600 hover:underline">Inspect</button>}
                      {t.status === "inspecting" && <span className="text-xs text-foreground-muted">Awaiting</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
