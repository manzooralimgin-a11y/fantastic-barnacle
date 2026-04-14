"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, Users, ListChecks } from "lucide-react";
import { cn } from "@/utils/cn";
import { useMeetingStore } from "@/store";
import { Card } from "@/components/ui";

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  return `${min} min`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-2xl bg-white/5", className)} />
  );
}

export function MeetingsList() {
  const { meetings, isLoading, fetchMeetings, selectMeeting } =
    useMeetingStore();

  useEffect(() => {
    if (meetings.length === 0) {
      fetchMeetings();
    }
  }, [meetings.length, fetchMeetings]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const sorted = [...meetings].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-3">
      {sorted.map((meeting, i) => (
        <motion.div
          key={meeting.id}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.3,
            delay: i * 0.08,
            ease: "easeOut" as const,
          }}
        >
          <Card
            variant="default"
            className="space-y-3"
            onClick={() => selectMeeting(meeting.id)}
          >
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-text-primary-dark">
                {meeting.title}
              </h3>
              <span className="flex-shrink-0 text-[10px] text-text-secondary-dark/60">
                {formatDate(meeting.date)}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-text-secondary-dark">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(meeting.duration)}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-secondary-dark">
                <Users className="h-3.5 w-3.5" />
                {meeting.participants.length} participants
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-secondary-dark">
                <ListChecks className="h-3.5 w-3.5" />
                {meeting.actionItems.length} actions
              </div>
            </div>

            <p className="line-clamp-2 text-xs leading-relaxed text-text-secondary-dark">
              {meeting.summary}
            </p>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
