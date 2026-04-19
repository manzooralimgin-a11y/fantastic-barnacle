// Type definitions only — activities are loaded from /api/dashboard/activity.
export type ActivityType = "booking" | "order" | "email" | "reservation";

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
