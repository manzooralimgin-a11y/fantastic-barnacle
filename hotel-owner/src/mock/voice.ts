export type VoiceDataType = "stat" | "list" | "confirmation";

export interface VoiceResponse {
  query: string;
  response: string;
  dataType: VoiceDataType;
  data: unknown;
}

export const MOCK_VOICE_RESPONSES = new Map<string, VoiceResponse>([
  [
    "bookings today",
    {
      query: "bookings today",
      response: "You have 24 bookings today. 18 are check-ins and 6 are restaurant reservations. Your next check-in is the Siemens group arriving at 14:00.",
      dataType: "stat",
      data: {
        total: 24,
        checkIns: 18,
        restaurantReservations: 6,
        nextArrival: { name: "Siemens Group", time: "14:00", rooms: 12 },
      },
    },
  ],
  [
    "revenue",
    {
      query: "revenue",
      response: "Today's revenue so far is €12,450, which is 11.2% higher than yesterday's €11,200. Restaurant revenue accounts for €3,800 and room revenue for €8,650. You're on track to exceed your daily target of €11,000.",
      dataType: "stat",
      data: {
        today: 12450,
        yesterday: 11200,
        growth: 11.2,
        breakdown: { restaurant: 3800, rooms: 8650 },
        dailyTarget: 11000,
      },
    },
  ],
  [
    "occupancy",
    {
      query: "occupancy",
      response: "Current occupancy is 84.4% — 38 of 45 rooms are occupied. That's 3.2 percentage points above last week. The remaining 7 rooms include 2 Suites and 5 Deluxe rooms. Weekend occupancy is projected at 100%.",
      dataType: "stat",
      data: {
        rate: 84.4,
        occupied: 38,
        total: 45,
        available: { suites: 2, deluxe: 5 },
        weekendProjection: 100,
        changeFromLastWeek: 3.2,
      },
    },
  ],
  [
    "emails",
    {
      query: "emails",
      response: "You have 6 pending emails. 2 are marked important: a corporate block booking from Siemens for 12 rooms, and a wedding venue inquiry for 120 guests in September. The AI has drafted replies for all of them.",
      dataType: "list",
      data: {
        pending: 6,
        important: 2,
        highlights: [
          "Corporate block booking — 12 rooms, April 14–18",
          "Wedding venue inquiry — 120 guests, September 12",
        ],
        aiRepliesDrafted: 6,
      },
    },
  ],
  [
    "meetings",
    {
      query: "meetings",
      response: "You have no meetings scheduled for today. Your last meeting was the Staff Weekly Sync on Friday. Key action items still open: confirm the Conti wine exclusivity deal by today, and review Max's WhatsApp integration proposal.",
      dataType: "list",
      data: {
        today: 0,
        lastMeeting: "Staff Weekly Sync — March 28",
        openActionItems: [
          "Confirm Conti wine exclusivity deal",
          "Review WhatsApp integration proposal",
        ],
      },
    },
  ],
  [
    "default",
    {
      query: "default",
      response: "I'm not sure I understood that. You can ask me about today's bookings, revenue, occupancy, pending emails, or upcoming meetings. How can I help?",
      dataType: "confirmation",
      data: {
        availableQueries: ["bookings today", "revenue", "occupancy", "emails", "meetings"],
      },
    },
  ],
]);
