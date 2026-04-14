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

export const MOCK_DASHBOARD: DashboardData = {
  revenueToday: 12450,
  revenueYesterday: 11200,
  revenueGrowth: 11.2,
  bookingsToday: 24,
  totalRooms: 45,
  occupiedRooms: 38,
  occupancyRate: 84.4,
  occupancyChange: 3.2,
  weeklyRevenue: [
    { day: "Mon", amount: 9800 },
    { day: "Tue", amount: 10450 },
    { day: "Wed", amount: 11200 },
    { day: "Thu", amount: 10900 },
    { day: "Fri", amount: 14200 },
    { day: "Sat", amount: 15800 },
    { day: "Sun", amount: 12450 },
  ],
  peakHours: [
    { hour: "10:00", bookings: 3 },
    { hour: "11:00", bookings: 5 },
    { hour: "12:00", bookings: 8 },
    { hour: "13:00", bookings: 12 },
    { hour: "14:00", bookings: 9 },
    { hour: "15:00", bookings: 6 },
    { hour: "16:00", bookings: 4 },
    { hour: "17:00", bookings: 7 },
    { hour: "18:00", bookings: 14 },
    { hour: "19:00", bookings: 18 },
    { hour: "20:00", bookings: 16 },
    { hour: "21:00", bookings: 10 },
    { hour: "22:00", bookings: 5 },
  ],
};
