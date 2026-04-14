"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useMeetingStore } from "@/store";
import { api } from "@/services/api";
import { Card, Button } from "@/components/ui";

type RecordingState = "idle" | "recording" | "processing" | "done" | "error";

function formatTimer(seconds: number): string {
  const min = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = (seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function WaveformBars() {
  return (
    <div className="flex items-center justify-center gap-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-status-error/70"
          initial={{ height: 8 }}
          animate={{
            height: [8, 20 + Math.random() * 16, 10, 24 + Math.random() * 12, 8],
          }}
          transition={{
            duration: 0.7 + Math.random() * 0.4,
            repeat: Infinity,
            repeatType: "reverse",
            delay: i * 0.08,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

interface RecordingViewProps {
  onComplete: () => void;
}

export function RecordingView({ onComplete }: RecordingViewProps) {
  const { startRecording, stopRecording, currentRecordingTime } =
    useMeetingStore();
  const [state, setState] = useState<RecordingState>("idle");
  const [savedRef, setSavedRef] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const durationRef = useRef(0);

  // Track duration so we can include it when saving
  useEffect(() => {
    durationRef.current = currentRecordingTime;
  }, [currentRecordingTime]);

  const handleStart = useCallback(() => {
    setState("recording");
    startRecording();
  }, [startRecording]);

  const handleStop = useCallback(() => {
    stopRecording();
    setState("processing");
  }, [stopRecording]);

  // When processing: save the meeting note to the HMS as a reception task
  useEffect(() => {
    if (state !== "processing") return;

    const duration = durationRef.current;
    const now = new Date();
    const dateStr = now.toLocaleDateString("de-DE");
    const timeStr = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

    api
      .authPost("/api/hms/housekeeping/tasks", {
        task_type: "reception",
        priority: "normal",
        room_number: null,
        title: `Meeting recorded — ${dateStr} ${timeStr}`,
        description:
          `A meeting was recorded by the owner on ${dateStr} at ${timeStr}. ` +
          `Duration: ${Math.floor(duration / 60)}m ${duration % 60}s. ` +
          `Audio transcription is not yet available — please review any written notes.`,
        task_source: "owner_app",
      })
      .then((res: { id?: number }) => {
        const ref = res?.id ? `HMS-${res.id}` : null;
        setSavedRef(ref);
        setState("done");
      })
      .catch((err: Error) => {
        console.warn("[RecordingView] Failed to save meeting note:", err.message);
        setSaveError("Could not save to management system. Note the meeting manually.");
        setState("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <AnimatePresence mode="wait">
        {/* Idle — Start button */}
        {state === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: "easeOut" as const }}
            className="flex flex-col items-center gap-4"
          >
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleStart}
              className="flex h-32 w-32 items-center justify-center rounded-full bg-accent shadow-lg shadow-accent/30"
            >
              <Mic className="h-12 w-12 text-primary" />
            </motion.button>
            <div className="text-center">
              <p className="text-base font-semibold text-text-primary-dark">
                Start Meeting
              </p>
              <p className="mt-1 text-xs text-text-secondary-dark">
                Tap to begin — a note will be saved to management when you stop.
              </p>
            </div>
          </motion.div>
        )}

        {/* Recording */}
        {state === "recording" && (
          <motion.div
            key="recording"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: "easeOut" as const }}
            className="flex flex-col items-center gap-6"
          >
            <div className="flex items-center gap-2">
              <motion.span
                className="h-3 w-3 rounded-full bg-status-error"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span className="text-sm font-medium text-status-error">
                Recording...
              </span>
            </div>

            <p className="font-mono text-5xl font-bold tabular-nums text-text-primary-dark">
              {formatTimer(currentRecordingTime)}
            </p>

            <div className="h-10">
              <WaveformBars />
            </div>

            <div className="flex items-center gap-6">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleStop}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-status-error shadow-lg shadow-status-error/30"
              >
                <Square className="h-6 w-6 fill-white text-white" />
              </motion.button>
            </div>
            <p className="text-xs text-text-secondary-dark">
              Tap to stop recording
            </p>
          </motion.div>
        )}

        {/* Processing */}
        {(state === "processing") && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: "easeOut" as const }}
            className="flex flex-col items-center gap-4"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="h-12 w-12 text-accent" />
            </motion.div>
            <p className="text-base font-semibold text-text-primary-dark">
              Saving to management system...
            </p>
          </motion.div>
        )}

        {/* Done */}
        {state === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" as const }}
            className="w-full space-y-4"
          >
            <div className="flex flex-col items-center gap-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
              >
                <CheckCircle2 className="h-12 w-12 text-status-success" />
              </motion.div>
              <p className="text-base font-semibold text-text-primary-dark">
                Meeting Note Saved
              </p>
              {savedRef && (
                <p className="text-xs text-text-secondary-dark">
                  Reference: <span className="font-mono">{savedRef}</span>
                </p>
              )}
            </div>

            <Card variant="glass">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary-dark">
                What was saved
              </h3>
              <p className="text-sm leading-relaxed text-text-primary-dark/90">
                A timestamped reception task has been created in the management system.
                Duration: {formatTimer(durationRef.current)}.
              </p>
              <p className="mt-2 text-xs text-text-secondary-dark/70">
                Audio transcription is not yet available — add written notes in the HMS reception task.
              </p>
            </Card>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={onComplete}
            >
              View Meetings
            </Button>
          </motion.div>
        )}

        {/* Error */}
        {state === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" as const }}
            className="w-full space-y-4"
          >
            <div className="flex flex-col items-center gap-2">
              <AlertCircle className="h-12 w-12 text-status-error" />
              <p className="text-base font-semibold text-text-primary-dark">
                Could Not Save
              </p>
            </div>

            <Card variant="glass">
              <p className="text-sm leading-relaxed text-text-primary-dark/90">
                {saveError}
              </p>
              <p className="mt-2 text-xs text-text-secondary-dark/70">
                Duration recorded: {formatTimer(durationRef.current)}. Please note this meeting manually in the HMS.
              </p>
            </Card>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={onComplete}
            >
              OK
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
