// Type definitions only — no mock data. Dashboard data is loaded from the backend.
export interface WeeklyRevenue {
  day: string;
  amount: number;
}

export interface PeakHour {
  hour: string;
  bookings: number;
}

export interface DashboardData {
  revenueToday: number;
  revenueYesterday: number;
  revenueGrowth: number;
  bookingsToday: number;
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number;
  occupancyChange: number;
  weeklyRevenue: WeeklyRevenue[];
  peakHours: PeakHour[];
}
