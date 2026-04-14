"use client";

import { useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic } from "lucide-react";
import { cn } from "@/utils/cn";
import { useVoiceStore } from "@/store";
import { Header } from "@/components/layout";
import { BottomNav } from "@/components/layout";
import { VoiceButton } from "./VoiceButton";
import { VoiceWaveAnimation } from "./VoiceWaveAnimation";
import { ConversationScreen } from "./ConversationScreen";

const mockQueries = [
  "How many bookings today?",
  "What's the revenue?",
  "Show me occupancy",
  "Any pending emails?",
  "What about meetings?",
];

export function VoiceView() {
  const {
    isListening,
    isProcessing,
    startListening,
    stopListening,
    sendQuery,
  } = useVoiceStore();

  const queryIndexRef = useRef(0);

  const handleTap = useCallback(() => {
    if (isProcessing) return;

    if (isListening) {
      stopListening();
      return;
    }

    // Start listening
    startListening();

    // After 2s simulate voice input
    setTimeout(() => {
      const query = mockQueries[queryIndexRef.current % mockQueries.length];
      queryIndexRef.current += 1;
      sendQuery(query);
    }, 2000);
  }, [isListening, isProcessing, startListening, stopListening, sendQuery]);

  return (
    <div className="flex h-[100dvh] flex-col bg-background-dark">
      <Header notificationCount={0} />

      {/* Page heading */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" as const }}
        className="flex items-center gap-3 px-4 pb-2"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
          <Mic className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-primary-dark">
            Voice Assistant
          </h1>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isListening
                  ? "bg-status-success animate-pulse"
                  : isProcessing
                    ? "bg-status-warning animate-pulse"
                    : "bg-text-secondary-dark/40"
              )}
            />
            <p className="text-xs text-text-secondary-dark">
              {isListening
                ? "Listening..."
                : isProcessing
                  ? "Processing..."
                  : "Ready"}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Conversation area */}
      <ConversationScreen className="flex-1" />

      {/* Bottom controls */}
      <div className="flex flex-col items-center gap-3 px-4 pb-24 pt-3">
        <AnimatePresence>
          <VoiceWaveAnimation isActive={isListening} className="h-10" />
        </AnimatePresence>

        <VoiceButton
          isListening={isListening}
          isProcessing={isProcessing}
          onTap={handleTap}
        />

        <p className="text-[10px] text-text-secondary-dark/50">
          {isListening
            ? "Listening... tap to cancel"
            : "Tap to speak"}
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
