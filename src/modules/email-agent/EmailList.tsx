"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Clock, Star } from "lucide-react";
import { cn } from "@/utils/cn";
import { useEmailStore } from "@/store";
import { Badge } from "@/components/ui";
import type { EmailTag } from "@/mock/emails";

const filters = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "replied", label: "Replied" },
  { key: "booking", label: "Booking" },
  { key: "inquiry", label: "Inquiry" },
  { key: "offer", label: "Offer" },
] as const;

const tagVariant: Record<EmailTag, "success" | "pending" | "warning" | "error"> = {
  booking: "success",
  inquiry: "pending",
  offer: "warning",
  complaint: "error",
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-2xl bg-white/5", className)} />
  );
}

export function EmailList() {
  const {
    emails,
    filter,
    isLoading,
    fetchEmails,
    selectEmail,
    setFilter,
    filteredEmails,
  } = useEmailStore();

  useEffect(() => {
    if (emails.length === 0) {
      fetchEmails();
    }
  }, [emails.length, fetchEmails]);

  const displayed = filteredEmails();

  return (
    <div className="flex flex-col gap-3">
      {/* Filter Tabs */}
      <div className="scrollbar-hide flex gap-1 overflow-x-auto pb-1">
        {filters.map((f) => {
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "relative flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "text-accent"
                  : "text-text-secondary-dark hover:text-text-primary-dark"
              )}
            >
              {f.label}
              {isActive && (
                <motion.div
                  layoutId="emailFilterIndicator"
                  className="absolute bottom-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-accent"
                  transition={{ duration: 0.3, ease: "easeOut" as const }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && displayed.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" as const }}
          className="flex flex-col items-center gap-2 py-16 text-center"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
            <CheckCircle2 className="h-6 w-6 text-text-secondary-dark" />
          </div>
          <p className="text-sm font-medium text-text-primary-dark">
            No emails found
          </p>
          <p className="text-xs text-text-secondary-dark">
            Try changing your filter
          </p>
        </motion.div>
      )}

      {/* Email items */}
      {!isLoading && (
        <AnimatePresence mode="popLayout">
          {displayed.map((email, i) => (
            <motion.button
              key={email.id}
              layout
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                duration: 0.3,
                delay: i * 0.05,
                ease: "easeOut" as const,
              }}
              whileTap={{ scale: 0.98 }}
              onClick={() => selectEmail(email.id)}
              className="group w-full rounded-2xl border border-white/5 bg-surface-dark/60 p-4 text-left transition-colors hover:bg-surface-dark"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {/* Tag + Status row */}
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge
                      variant={tagVariant[email.tag]}
                      label={email.tag.charAt(0).toUpperCase() + email.tag.slice(1)}
                    />
                    {email.status === "replied" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-status-success">
                        <CheckCircle2 className="h-3 w-3" />
                        Replied
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-status-warning">
                        <Clock className="h-3 w-3" />
                        Pending
                      </span>
                    )}
                    {email.isImportant && (
                      <Star className="h-3 w-3 fill-accent text-accent" />
                    )}
                  </div>

                  {/* Subject */}
                  <p className="truncate text-sm font-semibold text-text-primary-dark">
                    {email.subject}
                  </p>

                  {/* Preview */}
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary-dark">
                    {email.preview}
                  </p>
                </div>

                {/* Timestamp */}
                <span className="flex-shrink-0 text-[10px] text-text-secondary-dark/60">
                  {formatRelativeTime(email.receivedAt)}
                </span>
              </div>

              {/* Sender */}
              <p className="mt-2 text-[11px] text-text-secondary-dark">
                {email.sender}
              </p>
            </motion.button>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
