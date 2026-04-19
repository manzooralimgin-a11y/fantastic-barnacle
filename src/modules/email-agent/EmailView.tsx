"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Mail } from "lucide-react";
import { useEmailStore } from "@/store";
import { Header } from "@/components/layout";
import { BottomNav } from "@/components/layout";
import { EmailList } from "./EmailList";
import { EmailDetail } from "./EmailDetail";

export function EmailView() {
  const { selectedEmail, emails } = useEmailStore();
  const pendingCount = emails.filter((e) => e.status === "pending").length;

  return (
    <div className="min-h-screen bg-background-dark">
      <Header notificationCount={pendingCount} />

      <div className="px-4 pb-24 pt-2">
        {/* Page heading */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" as const }}
          className="mb-4 flex items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-pending/15">
            <Mail className="h-5 w-5 text-status-pending" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary-dark">
              Smart Inbox
            </h1>
            <p className="text-xs text-text-secondary-dark">
              AI-filtered • {pendingCount} pending
            </p>
          </div>
        </motion.div>

        <EmailList />
      </div>

      {/* Email Detail Bottom Sheet */}
      <AnimatePresence>
        {selectedEmail && <EmailDetail />}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
