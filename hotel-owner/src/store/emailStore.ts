import { create } from "zustand";
import type { Email } from "@/mock";
import { MOCK_EMAILS } from "@/mock";

type EmailFilter = "all" | "pending" | "replied" | "booking" | "inquiry" | "offer";

interface EmailState {
  emails: Email[];
  selectedEmail: Email | null;
  filter: EmailFilter;
  isLoading: boolean;
  fetchEmails: () => Promise<void>;
  selectEmail: (id: string) => void;
  clearSelection: () => void;
  setFilter: (filter: EmailFilter) => void;
  markAsReplied: (id: string) => void;
  filteredEmails: () => Email[];
}

export const useEmailStore = create<EmailState>((set, get) => ({
  emails: [],
  selectedEmail: null,
  filter: "all",
  isLoading: false,

  fetchEmails: async () => {
    set({ isLoading: true });
    await new Promise((resolve) => setTimeout(resolve, 800));
    set({ emails: MOCK_EMAILS, isLoading: false });
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
