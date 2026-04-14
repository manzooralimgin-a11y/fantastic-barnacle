export type ActivityType = "booking" | "order" | "email" | "reservation";

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export const MOCK_ACTIVITIES: Activity[] = [
  {
    id: "act-001",
    type: "booking",
    title: "New Room Booking",
    description: "Suite 501 booked for Apr 2–5 by Dr. Klaus Brandt (2 guests)",
    timestamp: "2026-03-30T13:42:00Z",
    metadata: { room: "501", guest: "Dr. Klaus Brandt", nights: 3, revenue: 1020 },
  },
  {
    id: "act-002",
    type: "email",
    title: "AI Reply Drafted",
    description: "Draft reply generated for corporate booking inquiry from Siemens",
    timestamp: "2026-03-30T13:15:00Z",
    metadata: { emailId: "em-001", sender: "Thomas Richter" },
  },
  {
    id: "act-003",
    type: "reservation",
    title: "Restaurant Reservation",
    description: "Table for 6 at 19:30 — Terrace, window seating requested",
    timestamp: "2026-03-30T12:50:00Z",
    metadata: { covers: 6, time: "19:30", area: "Terrace" },
  },
  {
    id: "act-004",
    type: "order",
    title: "Supplier Order Confirmed",
    description: "Linen delivery from Hotelwäsche Müller — 120 sets, arriving Apr 1",
    timestamp: "2026-03-30T12:30:00Z",
    metadata: { supplier: "Hotelwäsche Müller", items: 120, deliveryDate: "2026-04-01" },
  },
  {
    id: "act-005",
    type: "booking",
    title: "Check-in Completed",
    description: "Room 215 — Müller family (2 adults, 1 child), 4-night stay",
    timestamp: "2026-03-30T12:05:00Z",
    metadata: { room: "215", guests: 3, nights: 4 },
  },
  {
    id: "act-006",
    type: "reservation",
    title: "Group Dinner Confirmed",
    description: "Private dining for 12 guests — Wine Room, Thu 19:00",
    timestamp: "2026-03-30T11:40:00Z",
    metadata: { covers: 12, area: "Wine Room", date: "2026-04-02" },
  },
  {
    id: "act-007",
    type: "email",
    title: "Guest Complaint Resolved",
    description: "Noise complaint from Room 312 — apology sent with suite upgrade offer",
    timestamp: "2026-03-30T11:10:00Z",
    metadata: { emailId: "em-004", resolution: "Suite upgrade offered" },
  },
  {
    id: "act-008",
    type: "order",
    title: "Wine Order Placed",
    description: "180 bottles ordered from Conti Wines — Pinot Grigio, Montepulciano, Prosecco",
    timestamp: "2026-03-30T10:45:00Z",
    metadata: { supplier: "Conti Wines", bottles: 180, total: 1404 },
  },
  {
    id: "act-009",
    type: "booking",
    title: "Late Checkout Approved",
    description: "Room 308 — checkout extended to 14:00 for returning guest",
    timestamp: "2026-03-30T10:20:00Z",
    metadata: { room: "308", newCheckout: "14:00" },
  },
  {
    id: "act-010",
    type: "reservation",
    title: "Brunch Reservation",
    description: "Sunday brunch — 4 guests at 11:00, terrace seating",
    timestamp: "2026-03-30T09:55:00Z",
    metadata: { covers: 4, time: "11:00", area: "Terrace" },
  },
  {
    id: "act-011",
    type: "email",
    title: "Inquiry Received",
    description: "Wedding venue inquiry from Lisa & Markus Weber — 120 guests, Sep 12",
    timestamp: "2026-03-30T09:15:00Z",
    metadata: { emailId: "em-006", guestCount: 120 },
  },
  {
    id: "act-012",
    type: "booking",
    title: "Cancellation Processed",
    description: "Room 402 — Apr 8–10 cancelled by guest, full refund issued (€590)",
    timestamp: "2026-03-30T08:30:00Z",
    metadata: { room: "402", refund: 590, dates: "Apr 8–10" },
  },
];
