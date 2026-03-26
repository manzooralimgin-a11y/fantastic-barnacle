"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CheckCircle2, Timer, Plus } from "lucide-react";
import { fetchHotelRooms, type HotelRoomItem } from "@/lib/hotel-room-types";
import { cn } from "@/lib/utils";

type Ticket = { id: string; title: string; location: string; priority: "critical" | "high" | "medium" | "low"; assigned_to: string; status: "open" | "in-progress" | "resolved"; created: string };

const priorityColors: Record<string, string> = { critical: "bg-red-500/10 text-red-600", high: "bg-orange-500/10 text-orange-600", medium: "bg-amber-500/10 text-amber-600", low: "bg-emerald-500/10 text-emerald-600" };
const statusColors: Record<string, string> = { open: "bg-amber-500/10 text-amber-600", "in-progress": "bg-blue-500/10 text-blue-600", resolved: "bg-emerald-500/10 text-emerald-600" };

function deriveMaintenanceTickets(rooms: HotelRoomItem[]): Ticket[] {
  const assignees = ["Hans Mueller", "Karl Weber"];
  const today = new Date();
  return rooms.slice(0, 6).map((room, index) => {
    const created = new Date(today);
    created.setDate(created.getDate() - index);
    const issueTitle =
      room.status === "maintenance"
        ? `Maintenance follow-up for room ${room.number}`
        : room.status === "cleaning"
          ? `Inspect cleaning equipment in room ${room.number}`
          : `Preventive room check for ${room.number}`;
    const priority: Ticket["priority"] =
      room.status === "maintenance"
        ? "critical"
        : room.status === "cleaning"
          ? "high"
          : index % 2 === 0
            ? "medium"
            : "low";
    const status: Ticket["status"] =
      room.status === "maintenance"
        ? "in-progress"
        : room.status === "cleaning"
          ? "open"
          : "resolved";
    return {
      id: `MT-${room.number}`,
      title: issueTitle,
      location: `Room ${room.number}`,
      priority,
      assigned_to: assignees[index % assignees.length],
      status,
      created: created.toISOString().slice(0, 10),
    };
  });
}

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    fetchHotelRooms()
      .then((rooms) => {
        setTickets(deriveMaintenanceTickets(rooms));
      })
      .catch((error) => {
        console.error("Failed to load maintenance room data", error);
      });
  }, []);

  const stats = [
    { label: "Open Tickets", value: tickets.filter(t => t.status === "open").length, icon: AlertTriangle },
    { label: "In Progress", value: tickets.filter(t => t.status === "in-progress").length, icon: Clock },
    { label: "Resolved This Week", value: tickets.filter(t => t.status === "resolved").length, icon: CheckCircle2 },
    { label: "Avg Resolution", value: "4.2h", icon: Timer },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Maintenance</h1>
          <p className="text-foreground-muted mt-1">Facility maintenance requests and scheduling</p>
        </div>
        <button className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 self-start">
          <Plus className="w-4 h-4" /> New Ticket
        </button>
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

      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
              <tr><th className="px-6 py-4">ID</th><th className="px-6 py-4">Issue</th><th className="px-6 py-4">Location</th><th className="px-6 py-4">Priority</th><th className="px-6 py-4">Assigned</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Created</th></tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {tickets.map(t => (
                <tr key={t.id} className="hover:bg-foreground/[0.01] transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-foreground-muted">{t.id}</td>
                  <td className="px-6 py-4 font-medium text-foreground">{t.title}</td>
                  <td className="px-6 py-4 text-foreground-muted">{t.location}</td>
                  <td className="px-6 py-4"><Badge variant="secondary" className={cn("capitalize text-[10px] font-bold border-transparent rounded-full", priorityColors[t.priority])}>{t.priority}</Badge></td>
                  <td className="px-6 py-4 text-foreground-muted">{t.assigned_to}</td>
                  <td className="px-6 py-4"><Badge variant="secondary" className={cn("capitalize text-[10px] font-bold border-transparent rounded-full", statusColors[t.status])}>{t.status.replace("-", " ")}</Badge></td>
                  <td className="px-6 py-4 text-foreground-muted">{new Date(t.created).toLocaleDateString("de-DE")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
