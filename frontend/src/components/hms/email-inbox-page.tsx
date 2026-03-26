"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { EmailInboxResponse, EmailInboxThread } from "@/types/api";
import { Bot, Mail, RefreshCcw, Reply, Send, Sparkles } from "lucide-react";

const replyBadgeColors: Record<string, string> = {
  "Not Replied": "bg-amber-500/10 text-amber-700 border-transparent",
  "Auto Replied": "bg-emerald-500/10 text-emerald-700 border-transparent",
  "Manually Replied": "bg-primary/10 text-primary border-transparent",
};

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function extractionLabel(thread: EmailInboxThread): string {
  const extracted = thread.extracted_data || {};
  const intent = String(extracted.intent || "").trim();
  const guests = Number(extracted.guests || 0);
  const roomType = String(extracted.room_type || "").trim();
  const date =
    String(extracted.check_in || extracted.reservation_date || "").trim();
  const end = String(extracted.check_out || "").trim();

  if (intent === "hotel") {
    return [roomType || "Hotel request", date && end ? `${date} → ${end}` : date, guests ? `${guests} guests` : ""]
      .filter(Boolean)
      .join(" • ");
  }

  return [intent === "restaurant" ? "Restaurant request" : "Reservation inquiry", date, extracted.start_time ? String(extracted.start_time).slice(0, 5) : "", guests ? `${guests} guests` : ""]
    .filter(Boolean)
    .join(" • ");
}

export function EmailInboxPage() {
  const [data, setData] = useState<EmailInboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const threads = data?.items ?? [];

  async function loadThreads() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<EmailInboxResponse>("/hms/email-inbox");
      setData(response.data);
      setDrafts(
        Object.fromEntries(
          (response.data.items || []).map((thread) => [thread.id, thread.reply_content || ""]),
        ),
      );
    } catch (fetchError) {
      console.error("Failed to load email inbox", fetchError);
      setError("Failed to load filtered emails.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadThreads();
  }, []);

  const stats = useMemo(
    () => [
      { label: "Filtered Emails", value: data?.total ?? 0, icon: Mail },
      { label: "Pending Replies", value: data?.pending ?? 0, icon: Reply },
      { label: "Auto Replied", value: data?.auto_replied ?? 0, icon: Bot },
      { label: "Manually Replied", value: data?.manually_replied ?? 0, icon: Send },
    ],
    [data],
  );

  async function generateReply(threadId: number) {
    setBusyId(threadId);
    try {
      const response = await api.post<{ thread: EmailInboxThread }>(`/hms/email-inbox/${threadId}/generate-reply`);
      const updatedThread = response.data.thread;
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((thread) => (thread.id === threadId ? updatedThread : thread)),
        };
      });
      setDrafts((current) => ({ ...current, [threadId]: updatedThread.reply_content || "" }));
    } catch (generateError) {
      console.error("Failed to generate reply", generateError);
      setError("Reply generation failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveDraft(threadId: number) {
    setBusyId(threadId);
    try {
      const response = await api.patch<EmailInboxThread>(`/hms/email-inbox/${threadId}`, {
        reply_content: drafts[threadId] || "",
      });
      const updatedThread = response.data;
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((thread) => (thread.id === threadId ? updatedThread : thread)),
        };
      });
    } catch (saveError) {
      console.error("Failed to save draft", saveError);
      setError("Saving the draft failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function sendReply(threadId: number) {
    setBusyId(threadId);
    try {
      const response = await api.post<{ thread: EmailInboxThread }>(`/hms/email-inbox/${threadId}/send-reply`, {
        reply_content: drafts[threadId] || undefined,
      });
      const updatedThread = response.data.thread;
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((thread) => (thread.id === threadId ? updatedThread : thread)),
          pending: Math.max((current.pending || 1) - 1, 0),
          auto_replied:
            current.auto_replied + (updatedThread.replied_by_user_id == null ? 1 : 0),
          manually_replied:
            current.manually_replied + (updatedThread.replied_by_user_id != null ? 1 : 0),
        };
      });
    } catch (sendError) {
      console.error("Failed to send reply", sendError);
      setError("Reply sending failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Email Inbox (AI Filtered)</h1>
          <p className="text-foreground-muted mt-1">Only reservation-related emails are shown here, with extracted booking data and AI-assisted reply drafts.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadThreads()}
          className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 self-start"
        >
          <RefreshCcw className="w-4 h-4" /> Refresh Inbox
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p>
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3>
            </CardContent>
          </Card>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-6 text-sm text-foreground-muted">Loading filtered inbox…</CardContent>
          </Card>
        ) : threads.length === 0 ? (
          <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-6 text-sm text-foreground-muted">No reservation-related emails are currently waiting in the inbox.</CardContent>
          </Card>
        ) : (
          threads.map((thread) => (
            <Card key={thread.id} className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
              <CardContent className="p-6 space-y-5">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-editorial font-bold text-foreground">{thread.subject || "Reservation Inquiry"}</h2>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] font-bold border-transparent rounded-full",
                          replyBadgeColors[thread.reply_badge] || "bg-foreground/10 text-foreground-muted border-transparent",
                        )}
                      >
                        {thread.reply_badge}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] font-bold border-transparent rounded-full bg-primary/10 text-primary">
                        {thread.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground-muted">
                      From <span className="font-medium text-foreground">{thread.sender}</span> • {formatDateTime(thread.received_at)}
                    </p>
                    <p className="text-sm text-foreground-muted">{thread.summary || "No summary available."}</p>
                    <p className="text-sm font-medium text-foreground">{extractionLabel(thread)}</p>
                  </div>

                  <div className="flex flex-col gap-2 xl:min-w-[220px]">
                    <button
                      type="button"
                      disabled={busyId === thread.id}
                      onClick={() => void generateReply(thread.id)}
                      className="rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/15 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <Sparkles className="w-4 h-4" /> Generate Reply
                    </button>
                    <button
                      type="button"
                      disabled={busyId === thread.id}
                      onClick={() => void saveDraft(thread.id)}
                      className="rounded-xl bg-foreground/5 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-foreground/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <Reply className="w-4 h-4" /> Save Draft
                    </button>
                    <button
                      type="button"
                      disabled={busyId === thread.id}
                      onClick={() => void sendReply(thread.id)}
                      className="rounded-xl bg-[var(--color-brand-green)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-cream)] hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <Send className="w-4 h-4" /> Send Reply
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl bg-foreground/[0.03] border border-foreground/10 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                    {Object.entries(thread.extracted_data || {}).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{key.replace(/_/g, " ")}</p>
                        <p className="text-foreground mt-1 break-words">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Reply Draft</label>
                  <textarea
                    value={drafts[thread.id] ?? ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [thread.id]: event.target.value }))}
                    placeholder="Generate a reply or write one manually…"
                    className="min-h-[180px] w-full rounded-2xl border border-foreground/10 bg-muted px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
