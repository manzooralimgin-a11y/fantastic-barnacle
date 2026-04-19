import { create } from "zustand";
import type { DashboardData } from "@/mock";
import type { Activity, ActivityType } from "@/mock";
import { api } from "@/services/api";

// Backend response shapes
interface PmsCockpitItemRead {
  reservation_id: number;
  booking_id: string;
  guest_name: string;
  status: string;
}

interface PmsCockpitRead {
  property_id: number;
  focus_date: string;
  arrivals: PmsCockpitItemRead[];
  in_house: PmsCockpitItemRead[];
  departures: PmsCockpitItemRead[];
  reservations: PmsCockpitItemRead[];
  live_log: PmsCockpitItemRead[];
}

interface ReportSummaryRead {
  room_count: number;
  occupancy_pct: number;
  turnover_total: number;
  arrivals: number;
  departures: number;
}

interface ReportDailyPointRead {
  report_date: string;
  occupancy_pct: number;
  turnover: number;
}

interface ReportDailyRead {
  room_count: number;
  items: ReportDailyPointRead[];
}

export interface DailyOccupancyPoint {
  day: string;
  rate: number;
}

interface AgentActionRead {
  id: number;
  agent_name: string;
  action_type: string;
  description: string;
  status: string;
  created_at: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function mapActionType(actionType: string, agentName: string): ActivityType {
  const t = `${actionType} ${agentName}`.toLowerCase();
  if (t.includes("email") || t.includes("inbox") || t.includes("reply")) return "email";
  if (t.includes("order") || t.includes("inventory") || t.includes("supply")) return "order";
  if (t.includes("reservation") || t.includes("table") || t.includes("restaurant")) return "reservation";
  return "booking";
}

function mapActivity(a: AgentActionRead): Activity {
  return {
    id: String(a.id),
    type: mapActionType(a.action_type, a.agent_name),
    title: a.action_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: a.description,
    timestamp: a.created_at,
  };
}

async function loadDashboard(): Promise<{ data: DashboardData; dailyOccupancy: DailyOccupancyPoint[] }> {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [cockpit, todayReport, yesterdayReport, weeklyReport] = await Promise.all([
    api.authGet<PmsCockpitRead>(`/api/hms/pms/cockpit`),
    api.authGet<ReportSummaryRead>(
      `/api/hms/pms/reports/summary?days=1&start_date=${toISODate(today)}`
    ),
    api.authGet<ReportSummaryRead>(
      `/api/hms/pms/reports/summary?days=1&start_date=${toISODate(yesterday)}`
    ),
    api.authGet<ReportDailyRead>(`/api/hms/pms/reports/daily?days=7`),
  ]);

  const revenueToday = todayReport.turnover_total;
  const revenueYesterday = yesterdayReport.turnover_total;
  const revenueGrowth =
    revenueYesterday > 0
      ? Math.round(((revenueToday - revenueYesterday) / revenueYesterday) * 1000) / 10
      : 0;

  const weeklyRevenue = weeklyReport.items.map((item) => ({
    day: DAY_LABELS[new Date(item.report_date + "T12:00:00").getDay()],
    amount: Math.round(item.turnover),
  }));

  const dailyOccupancy: DailyOccupancyPoint[] = weeklyReport.items.map((item) => ({
    day: DAY_LABELS[new Date(item.report_date + "T12:00:00").getDay()],
    rate: Math.round(item.occupancy_pct * 10) / 10,
  }));

  return {
    data: {
      revenueToday,
      revenueYesterday,
      revenueGrowth,
      bookingsToday: cockpit.arrivals.length,
      totalRooms: todayReport.room_count || weeklyReport.room_count,
      occupiedRooms: cockpit.in_house.length,
      occupancyRate: Math.round(todayReport.occupancy_pct * 10) / 10,
      occupancyChange:
        Math.round((todayReport.occupancy_pct - yesterdayReport.occupancy_pct) * 10) / 10,
      weeklyRevenue,
      peakHours: [],
    },
    dailyOccupancy,
  };
}

async function loadActivity(): Promise<Activity[]> {
  const rows = await api.authGet<AgentActionRead[]>(`/api/dashboard/activity?limit=12`);
  return rows.map(mapActivity);
}

interface DashboardState {
  data: DashboardData | null;
  activities: Activity[];
  dailyOccupancy: DailyOccupancyPoint[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  fetchDashboard: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function loadAll(): Promise<{
  data: DashboardData;
  dailyOccupancy: DailyOccupancyPoint[];
  activities: Activity[];
}> {
  const [core, activities] = await Promise.all([
    loadDashboard(),
    loadActivity().catch(() => [] as Activity[]),
  ]);
  return { ...core, activities };
}

export const useDashboardStore = create<DashboardState>((set) => ({
  data: null,
  activities: [],
  dailyOccupancy: [],
  isLoading: false,
  error: null,
  lastUpdated: null,

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, dailyOccupancy, activities } = await loadAll();
      set({ data, dailyOccupancy, activities, isLoading: false, lastUpdated: new Date() });
    } catch (err) {
      console.error("[dashboardStore] fetchDashboard failed:", err);
      set({ isLoading: false, error: errMsg(err) });
    }
  },

  refreshDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, dailyOccupancy, activities } = await loadAll();
      set({ data, dailyOccupancy, activities, isLoading: false, lastUpdated: new Date() });
    } catch (err) {
      console.error("[dashboardStore] refreshDashboard failed:", err);
      set({ isLoading: false, error: errMsg(err) });
    }
  },
}));
