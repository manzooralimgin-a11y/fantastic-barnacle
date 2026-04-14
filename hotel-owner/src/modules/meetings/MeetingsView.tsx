"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { cn } from "@/utils/cn";
import { useMeetingStore } from "@/store";
import { Header } from "@/components/layout";
import { BottomNav } from "@/components/layout";
import { MeetingsList } from "./MeetingsList";
import { MeetingDetail } from "./MeetingDetail";
import { RecordingView } from "./RecordingView";

type ViewTab = "list" | "record";

export function MeetingsView() {
  const [activeView, setActiveView] = useState<ViewTab>("list");
  const { selectedMeeting } = useMeetingStore();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background-dark">
      <Header notificationCount={0} />

      {/* Page heading */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" as const }}
        className="flex items-center gap-3 px-4 pb-3"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-success/15">
          <CalendarDays className="h-5 w-5 text-status-success" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-primary-dark">
            Meetings
          </h1>
          <p className="text-xs text-text-secondary-dark">
            Record & review meetings
          </p>
        </div>
      </motion.div>

      {/* Segment control */}
      <div className="mx-4 mb-4 flex rounded-xl bg-white/5 p-1">
        {(
          [
            { key: "list", label: "Past Meetings" },
            { key: "record", label: "Record New" },
          ] as const
        ).map((tab) => {
          const isActive = activeView === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={cn(
                "relative flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                isActive
                  ? "text-text-primary-dark"
                  : "text-text-secondary-dark hover:text-text-primary-dark"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="meetingSegment"
                  className="absolute inset-0 rounded-lg bg-white/10"
                  transition={{ duration: 0.3, ease: "easeOut" as const }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col px-4 pb-24">
        <AnimatePresence mode="wait">
          {activeView === "list" ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.25, ease: "easeOut" as const }}
            >
              <MeetingsList />
            </motion.div>
          ) : (
            <motion.div
              key="record"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.25, ease: "easeOut" as const }}
              className="flex flex-1 flex-col"
            >
              <RecordingView onComplete={() => setActiveView("list")} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Meeting detail overlay */}
      <AnimatePresence>
        {selectedMeeting && <MeetingDetail />}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
