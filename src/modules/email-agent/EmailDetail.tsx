"use client";

import { motion } from "framer-motion";
import {
  X,
  Sparkles,
  Send,
  Pencil,
  CheckCircle2,
  Clock,
  Star,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useEmailStore } from "@/store";
import { Badge, Button, Card } from "@/components/ui";
import type { EmailTag } from "@/mock/emails";

const tagVariant: Record<EmailTag, "success" | "pending" | "warning" | "error"> = {
  booking: "success",
  inquiry: "pending",
  offer: "warning",
  complaint: "error",
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EmailDetail() {
  const { selectedEmail, clearSelection, markAsReplied } = useEmailStore();

  if (!selectedEmail) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={clearSelection}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      />

      {/* Bottom Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-background-dark"
      >
        {/* Drag handle */}
        <div className="sticky top-0 z-10 flex items-center justify-center bg-background-dark pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="px-4 pb-8">
          {/* Header row */}
          <div className="mb-4 flex items-start justify-between">
            <div className="flex-1 pr-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge
                  variant={tagVariant[selectedEmail.tag]}
                  label={
                    selectedEmail.tag.charAt(0).toUpperCase() +
                    selectedEmail.tag.slice(1)
                  }
                />
                {selectedEmail.status === "replied" ? (
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
                {selectedEmail.isImportant && (
                  <Star className="h-3 w-3 fill-accent text-accent" />
                )}
              </div>
              <h2 className="text-lg font-bold text-text-primary-dark">
                {selectedEmail.subject}
              </h2>
            </div>
            <button
              onClick={clearSelection}
              className="flex-shrink-0 rounded-xl bg-white/5 p-2 transition-colors hover:bg-white/10"
            >
              <X className="h-5 w-5 text-text-secondary-dark" />
            </button>
          </div>

          {/* Sender info */}
          <div className="mb-4 rounded-xl bg-white/5 p-3">
            <p className="text-sm font-medium text-text-primary-dark">
              {selectedEmail.sender}
            </p>
            <p className="text-xs text-text-secondary-dark">
              {selectedEmail.senderEmail}
            </p>
            <p className="mt-1 text-[10px] text-text-secondary-dark/60">
              {formatDateTime(selectedEmail.receivedAt)}
            </p>
          </div>

          {/* Email body */}
          <div className="mb-6">
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-primary-dark/90">
              {selectedEmail.body}
            </p>
          </div>

          {/* Divider */}
          <div className="mb-6 h-px bg-white/10" />

          {/* AI Suggested Reply */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2, ease: "easeOut" as const }}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15">
                <Sparkles className="h-4 w-4 text-accent" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary-dark">
                AI Suggested Reply
              </h3>
            </div>

            <Card
              variant="glass"
              className={cn(
                "mb-4 border-accent/10 bg-accent/5"
              )}
            >
              <p className="whitespace-pre-line text-sm leading-relaxed text-text-primary-dark/80">
                {selectedEmail.aiReply}
              </p>
            </Card>

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                onClick={clearSelection}
              >
                <Send className="h-4 w-4" />
                Send Reply
              </Button>
              <Button variant="secondary" size="md" className="flex-1">
                <Pencil className="h-4 w-4" />
                Edit Reply
              </Button>
            </div>

            {/* Mark as Replied */}
            {selectedEmail.status === "pending" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.4 }}
                className="mt-3"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => markAsReplied(selectedEmail.id)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark as Replied
                </Button>
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </>
  );
}
