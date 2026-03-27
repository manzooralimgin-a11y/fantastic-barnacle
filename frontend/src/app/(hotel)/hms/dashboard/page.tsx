"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Bed, Users, TrendingUp } from "lucide-react";
import api from "@/lib/api";
import { ApiError } from "@/components/shared/api-error";
import { cn } from "@/lib/utils";

type HotelOverview = {
  hotel_name: string;
  city: string;
  total_rooms: number;
  occupied: number;
  available: number;
  cleaning: number;
};

type RoomStatus = {
  id: string;
  number: string;
  room_type_name: string;
  status: "available" | "occupied" | "cleaning" | "maintenance";
};

const fallbackOverview: HotelOverview = {
  hotel_name: "DAS Elb Magdeburg",
  city: "Magdeburg",
  total_rooms: 0,
  occupied: 0,
  available: 0,
  cleaning: 0,
};

const fallbackRooms: RoomStatus[] = [];

export default function HMSDashboardPage() {
  const [overview, setOverview] = useState<HotelOverview>(fallbackOverview);
  const [rooms, setRooms] = useState<RoomStatus[]>(fallbackRooms);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setFetchError(null);
      try {
        const [overviewRes, roomsRes] = await Promise.all([
          api.get("/hms/overview"),
          api.get("/hms/rooms")
        ]);
        setOverview(overviewRes.data);
        setRooms(roomsRes.data.items || []);
      } catch (err) {
        console.error("Failed to fetch HMS data", err);
        setFetchError("Failed to load room inventory.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">
            Hotel Management
          </h1>
          <p className="text-foreground-muted mt-1">
            {overview.hotel_name} • {overview.city} • Integrated AgentCore HMS
          </p>
        </div>

        <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 py-1 px-3">
                <LayoutDashboard className="w-3 h-3 mr-2" />
                Live Hub
            </Badge>
        </div>
      </div>

      {fetchError && <ApiError message={fetchError} dismissible={false} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Inventory" value={overview.total_rooms} icon={Bed} trend="+0% vs LW" />
        <StatCard label="Live Occupancy" value={overview.occupied} icon={Users} trend="+12% vs LW" />
        <StatCard label="Available Now" value={overview.available} icon={TrendingUp} trend="-2 since 8am" />
        <StatCard label="In Turnover" value={overview.cleaning} icon={CleaningBuckets} trend="4 pending" />
      </div>


      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
        <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] flex flex-row items-center justify-between px-6 py-6">
          <div>
            <CardTitle className="text-lg font-editorial text-foreground">Room Status Board</CardTitle>
            <p className="text-xs text-foreground-muted">Real-time room occupancy and housekeeping status</p>
          </div>
          <button className="text-xs font-medium text-primary hover:underline">View All Rooms</button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
                <tr>
                  <th className="px-6 py-5">Room No.</th>
                  <th className="px-6 py-5">Type</th>
                  <th className="px-6 py-5">Status</th>
                  <th className="px-6 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {rooms.map((room) => (
                  <tr key={room.id} className="group hover:bg-foreground/[0.01] transition-colors">
                    <td className="px-6 py-5 font-mono font-bold text-foreground">
                      {room.number}
                    </td>
                    <td className="px-6 py-5 text-foreground-muted">
                      {room.room_type_name}
                    </td>
                    <td className="px-6 py-5">
                      <Badge 
                        variant="secondary" 
                        className={cn(
                            "capitalize px-3 py-1 text-[10px] font-bold tracking-wide border rounded-full shadow-none",
                            room.status === "available" && "bg-foreground/10 text-foreground border-transparent",
                            room.status === "occupied" && "bg-primary text-primary-foreground border-transparent",
                            room.status === "cleaning" && "bg-primary/10 text-primary border-transparent",
                            room.status === "maintenance" && "bg-foreground text-primary-foreground border-primary"
                        )}
                      >
                        {room.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-5 text-right">
                        <button className="text-xs text-foreground/40 hover:text-foreground transition-colors font-medium">Manage</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

function StatCard({ label, value, icon: Icon, trend }: any) {
  return (
    <Card className="bg-card shadow-[var(--shadow-soft)] border-none hover:translate-y-[-2px] transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p>
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Icon className="w-5 h-5" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3>
          <span className="text-[10px] font-medium text-foreground/60">{trend}</span>
        </div>
      </CardContent>
    </Card>
  );
}


function CleaningBuckets(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M7 11h10" />
            <path d="M9 7h6" />
            <path d="M11 3h2" />
            <path d="M12 11v4" />
            <path d="M7 15h10" />
            <path d="m5 15 2-7h10l2 7Z" />
            <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
        </svg>
    )
}
