import { create } from "zustand";
import type { Email, EmailTag, EmailStatus } from "@/mock";
import { api } from "@/services/api";

// Backend response shapes
interface EmailThreadRead {
  id: number;
  external_email_id: string;
  sender: string;          // raw "From" field — may be "Name <email@host>" or just "email@host"
  subject: string | null;
  body: string;
  received_at: string;
  category: string;        // "pending" | "reservation" | "spam" | "other"
  reply_content: string | null;
  reply_generated: boolean;
  reply_sent: boolean;
  status: string;          // "pending" | "processed" | "ignored"
  reply_badge: string;
}

interface EmailInboxListResponse {
  items: EmailThreadRead[];
  total: number;
  pending: number;
  auto_replied: number;
  manually_replied: number;
}

/** Parse "Display Name <email@host>" or plain "email@host" */
function parseSender(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: raw, email: raw };
}

function mapCategory(category: string): EmailTag {
  if (category === "reservation") return "booking";
  if (category === "spam") return "inquiry";
  return "inquiry";
}

function mapStatus(status: string): EmailStatus {
  return status === "processed" ? "replied" : "pending";
}

function mapThread(t: EmailThreadRead): Email {
  const { name, email } = parseSender(t.sender);
  return {
    id: String(t.id),
    subject: t.subject ?? "(no subject)",
    sender: name,
    senderEmail: email,
    preview: t.body.slice(0, 120).replace(/\s+/g, " ").trim(),
    body: t.body,
    tag: mapCategory(t.category),
    status: mapStatus(t.status),
    aiReply: t.reply_content ?? "",
    receivedAt: t.received_at,
    isImportant: t.category === "reservation" || t.reply_badge === "important",
  };
}

type EmailFilter = "all" | "pending" | "replied" | "booking" | "inquiry" | "offer";

interface EmailState {
  emails: Email[];
  selectedEmail: Email | null;
  filter: EmailFilter;
  isLoading: boolean;
  error: string | null;
  fetchEmails: () => Promise<void>;
  selectEmail: (id: string) => void;
  clearSelection: () => void;
  setFilter: (filter: EmailFilter) => void;
  markAsReplied: (id: string) => void;
  filteredEmails: () => Email[];
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export const useEmailStore = create<EmailState>((set, get) => ({
  emails: [],
  selectedEmail: null,
  filter: "all",
  isLoading: false,
  error: null,

  fetchEmails: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.authGet<EmailInboxListResponse>("/api/hms/email-inbox");
      set({ emails: data.items.map(mapThread), isLoading: false });
    } catch (err) {
      console.error("[emailStore] fetchEmails failed:", err);
      set({ isLoading: false, error: errMsg(err) });
    }
  },

  selectEmail: (id) => {
    const email = get().emails.find((e) => e.id === id) ?? null;
    set({ selectedEmail: email });
  },

  clearSelection: () => {
    set({ selectedEmail: null });
  },

  setFilter: (filter) => {
    set({ filter });
  },

  markAsReplied: (id) => {
    const emails = get().emails.map((e) =>
      e.id === id ? { ...e, status: "replied" as const } : e
    );
    const selectedEmail = get().selectedEmail;
    set({
      emails,
      selectedEmail:
        selectedEmail?.id === id
          ? { ...selectedEmail, status: "replied" as const }
          : selectedEmail,
    });
  },

  filteredEmails: () => {
    const { emails, filter } = get();
    if (filter === "all") return emails;
    if (filter === "pending" || filter === "replied") {
      return emails.filter((e) => e.status === filter);
    }
    return emails.filter((e) => e.tag === filter);
  },
}));
