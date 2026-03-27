"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Activity, ShieldAlert, Camera } from "lucide-react";
import { fetchHotelRooms, type HotelRoomItem } from "@/lib/hotel-room-types";
import { ApiError } from "@/components/shared/api-error";
import { cn } from "@/lib/utils";

type AuditEvent = {
  time: string;
  user: string;
  action: string;
  location: string;
  status: "allowed" | "denied" | "alert";
};

function deriveAuditLog(rooms: HotelRoomItem[]): AuditEvent[] {
  const roomEvents: AuditEvent[] = rooms.slice(0, 4).map((room, index) => {
    const status: AuditEvent["status"] = index === 2 ? "denied" : "allowed";
    return {
      time: ["11:02", "10:58", "10:45", "10:30"][index] || "10:00",
      user: ["Guest Access", "Housekeeping", "Unknown", "Maintenance"][index] || "System",
      action: index === 2 ? `Key card denied for room ${room.number}` : `Room ${room.number} access`,
      location: room.room_type_name,
      status,
    };
  });
  return [
    ...roomEvents,
    { time: "10:15", user: "Facilities", action: "Utility room entry", location: "Basement", status: "allowed" },
    { time: "09:55", user: "System", action: "Fire alarm test", location: "All Floors", status: "alert" },
    { time: "09:15", user: "Admin", action: "Key card batch issued", location: "Front Desk", status: "allowed" },
  ];
}

const statusColors: Record<string, string> = { allowed: "bg-emerald-500/10 text-emerald-600", denied: "bg-red-500/10 text-red-600", alert: "bg-amber-500/10 text-amber-600" };

export default function SecurityPage() {
  const [roomCount, setRoomCount] = useState(0);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetchHotelRooms()
      .then((rooms) => {
        setFetchError(null);
        setRoomCount(rooms.length);
        setAuditLog(deriveAuditLog(rooms));
      })
      .catch((error) => {
        console.error("Failed to load security room data", error);
        setFetchError("Failed to load hotel room security data.");
      });
  }, []);

  const stats = [
    { label: "Active Key Cards", value: roomCount * 2, icon: KeyRound },
    { label: "Access Events Today", value: auditLog.length, icon: Activity },
    { label: "Security Alerts", value: auditLog.filter((event) => event.status !== "allowed").length, icon: ShieldAlert },
    { label: "Cameras Online", value: "12/12", icon: Camera },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div><h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Security</h1><p className="text-foreground-muted mt-1">Access control, audit logs, and compliance</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none"><CardContent className="p-6"><div className="flex items-center justify-between mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p><div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div></div><h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3></CardContent></Card>
        ))}
      </div>
      {fetchError && <ApiError message={fetchError} dismissible={false} />}
      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
        <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5"><CardTitle className="text-lg font-editorial text-foreground">Access Audit Log</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]"><tr><th className="px-6 py-4">Time</th><th className="px-6 py-4">User</th><th className="px-6 py-4">Action</th><th className="px-6 py-4">Location</th><th className="px-6 py-4">Status</th></tr></thead>
            <tbody className="divide-y divide-foreground/10">
              {auditLog.map((e, i) => (
                <tr key={i} className="hover:bg-foreground/[0.01] transition-colors">
                  <td className="px-6 py-4 font-mono text-foreground-muted">{e.time}</td>
                  <td className="px-6 py-4 font-medium text-foreground">{e.user}</td>
                  <td className="px-6 py-4 text-foreground-muted">{e.action}</td>
                  <td className="px-6 py-4 text-foreground-muted">{e.location}</td>
                  <td className="px-6 py-4"><Badge variant="secondary" className={cn("capitalize text-[10px] font-bold border-transparent rounded-full", statusColors[e.status])}>{e.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
