// Type definitions only — no mock data. Meetings have no backend endpoint yet.
export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: number;
  transcript: string;
  summary: string;
  audioUrl: string | null;
  participants: string[];
  actionItems: string[];
}
