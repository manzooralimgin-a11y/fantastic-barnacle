// Type definitions only — no mock data. Emails are loaded from the backend.
export type EmailTag = "booking" | "inquiry" | "offer" | "complaint";
export type EmailStatus = "replied" | "pending";

export interface Email {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  preview: string;
  body: string;
  tag: EmailTag;
  status: EmailStatus;
  aiReply: string;
  receivedAt: string;
  isImportant: boolean;
}
