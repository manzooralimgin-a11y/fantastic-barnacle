"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Share2,
  CheckSquare,
  Square,
  Search,
  Play,
  Pause,
  Volume2,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useMeetingStore } from "@/store";
import { Card } from "@/components/ui";

type Tab = "summary" | "transcript" | "audio";

const tabs: { key: Tab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "transcript", label: "Transcript" },
  { key: "audio", label: "Audio" },
];

function formatFullDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  return `${min} min`;
}

function HighlightedText({
  text,
  search,
}: {
  text: string;
  search: string;
}) {
  if (!search.trim()) {
    return (
      <p className="whitespace-pre-line text-sm leading-relaxed text-text-primary-dark/90">
        {text}
      </p>
    );
  }

  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);

  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-text-primary-dark/90">
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="rounded bg-accent/30 px-0.5 text-accent"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </p>
  );
}

export function MeetingDetail() {
  const { selectedMeeting, clearSelection } = useMeetingStore();
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);

  const matchCount = useMemo(() => {
    if (!searchQuery.trim() || !selectedMeeting) return 0;
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return (selectedMeeting.transcript.match(regex) || []).length;
  }, [searchQuery, selectedMeeting]);

  if (!selectedMeeting) return null;

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: "100%" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: "100%" }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background-dark"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-background-dark/90 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={() => {
            clearSelection();
            setActiveTab("summary");
            setCheckedItems(new Set());
            setSearchQuery("");
          }}
          className="flex items-center gap-1.5 text-sm font-medium text-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button className="rounded-xl bg-white/5 p-2 transition-colors hover:bg-white/10">
          <Share2 className="h-4 w-4 text-text-secondary-dark" />
        </button>
      </div>

      {/* Meeting info */}
      <div className="px-4 py-4">
        <h2 className="text-lg font-bold text-text-primary-dark">
          {selectedMeeting.title}
        </h2>
        <p className="mt-1 text-xs text-text-secondary-dark">
          {formatFullDate(selectedMeeting.date)} •{" "}
          {formatDuration(selectedMeeting.duration)}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5 px-4">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "text-accent"
                  : "text-text-secondary-dark hover:text-text-primary-dark"
              )}
            >
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="meetingTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-accent"
                  transition={{ duration: 0.3, ease: "easeOut" as const }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 py-4">
        <AnimatePresence mode="wait">
          {activeTab === "summary" && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" as const }}
              className="space-y-5"
            >
              {/* Summary */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary-dark">
                  AI Summary
                </h3>
                <p className="text-sm leading-relaxed text-text-primary-dark/90">
                  {selectedMeeting.summary}
                </p>
              </div>

              {/* Action Items */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary-dark">
                  Action Items
                </h3>
                <div className="space-y-2">
                  {selectedMeeting.actionItems.map((item, idx) => (
                    <motion.button
                      key={idx}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleCheck(idx)}
                      className="flex w-full items-start gap-3 rounded-xl bg-white/5 p-3 text-left transition-colors hover:bg-white/8"
                    >
                      {checkedItems.has(idx) ? (
                        <CheckSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-success" />
                      ) : (
                        <Square className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-secondary-dark" />
                      )}
                      <span
                        className={cn(
                          "text-sm",
                          checkedItems.has(idx)
                            ? "text-text-secondary-dark line-through"
                            : "text-text-primary-dark"
                        )}
                      >
                        {item}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Participants */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary-dark">
                  Participants
                </h3>
                <div className="space-y-2">
                  {selectedMeeting.participants.map((p, idx) => {
                    const initials = p
                      .split(" ")
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase();
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 rounded-xl bg-white/5 p-3"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                          {initials}
                        </div>
                        <span className="text-sm text-text-primary-dark">
                          {p}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "transcript" && (
            <motion.div
              key="transcript"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" as const }}
              className="space-y-4"
            >
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary-dark" />
                <input
                  type="text"
                  placeholder="Search transcript..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-text-primary-dark placeholder:text-text-secondary-dark/50 focus:border-accent/30 focus:outline-none focus:ring-1 focus:ring-accent/20"
                />
                {searchQuery && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-secondary-dark">
                    {matchCount} match{matchCount !== 1 ? "es" : ""}
                  </span>
                )}
              </div>

              {/* Transcript */}
              <Card variant="glass" className="max-h-[60vh] overflow-y-auto">
                <HighlightedText
                  text={selectedMeeting.transcript}
                  search={searchQuery}
                />
              </Card>
            </motion.div>
          )}

          {activeTab === "audio" && (
            <motion.div
              key="audio"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" as const }}
              className="flex flex-col items-center gap-6 py-8"
            >
              {/* Audio player UI */}
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/10">
                <Volume2 className="h-8 w-8 text-accent/40" />
              </div>

              <div className="w-full space-y-3">
                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-0 rounded-full bg-accent/40" />
                </div>

                <div className="flex items-center justify-between text-[10px] text-text-secondary-dark/50">
                  <span>0:00</span>
                  <span>{formatDuration(selectedMeeting.duration)}</span>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 transition-colors hover:bg-white/10"
                  >
                    {isPlaying ? (
                      <Pause className="h-6 w-6 text-text-secondary-dark" />
                    ) : (
                      <Play className="ml-1 h-6 w-6 text-text-secondary-dark" />
                    )}
                  </button>
                </div>
              </div>

              {/* Demo notice */}
              <Card variant="glass" className="text-center">
                <p className="text-sm font-medium text-text-primary-dark/60">
                  Audio unavailable in demo mode
                </p>
                <p className="mt-1 text-xs text-text-secondary-dark/50">
                  In production, meeting recordings will be played here
                  with full playback controls and speed adjustment.
                </p>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
