"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Mic, Radio, Volume2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { Header } from "@/components/layout";
import { BottomNav } from "@/components/layout";
import { VoiceButton } from "./VoiceButton";
import { VoiceWaveAnimation } from "./VoiceWaveAnimation";
import { ConversationScreen } from "./ConversationScreen";
import { useRealtimeVoice } from "./useRealtimeVoice";

function StatusPill({
  active,
  icon,
  label,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-white/10 bg-white/5 text-text-secondary-dark"
      )}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

export function VoiceView() {
  const {
    connectionState,
    error,
    isAwaitingResponse,
    isListening,
    isPlaying,
    messages,
    toggleListening,
  } = useRealtimeVoice();
  const errorAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error != null) {
      errorAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [error]);

  const isConnecting = connectionState === "connecting";
  const statusLabel =
    error != null
      ? "Attention Needed"
      : isListening
        ? "Listening"
        : isPlaying
          ? "Assistant Speaking"
          : isAwaitingResponse
            ? "Waiting For Voice"
            : connectionState === "connected"
              ? "Realtime Session Ready"
              : isConnecting
                ? "Connecting"
                : "Ready";

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
                error != null
                  ? "bg-status-error"
                  : isListening
                  ? "bg-status-success animate-pulse"
                  : isPlaying || isAwaitingResponse || isConnecting
                    ? "bg-status-warning animate-pulse"
                    : "bg-text-secondary-dark/40"
              )}
            />
            <p className="text-xs text-text-secondary-dark">
              {statusLabel}
            </p>
          </div>
        </div>
      </motion.div>

      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-2">
          <StatusPill
            active={connectionState === "connected"}
            icon={<Radio className="h-3.5 w-3.5" />}
            label="Realtime Socket"
          />
          <StatusPill
            active={isListening}
            icon={<Mic className="h-3.5 w-3.5" />}
            label="Microphone Stream"
          />
          <StatusPill
            active={isPlaying}
            icon={<Volume2 className="h-3.5 w-3.5" />}
            label="Voice Playback"
          />
        </div>
      </div>

      {error != null ? (
        <div ref={errorAnchorRef} className="px-4 pb-2">
          <div className="flex items-start gap-3 rounded-2xl border border-status-error/40 bg-status-error/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-error" />
            <p className="text-sm leading-relaxed text-status-error">{error}</p>
          </div>
        </div>
      ) : null}

      <ConversationScreen
        className="flex-1"
        isAwaitingResponse={isAwaitingResponse}
        messages={messages}
      />

      <div className="flex flex-col items-center gap-3 px-4 pb-24 pt-3">
        <AnimatePresence>
          <VoiceWaveAnimation
            isActive={isListening || isPlaying}
            className="h-10"
          />
        </AnimatePresence>

        <VoiceButton
          isListening={isListening}
          isProcessing={isConnecting}
          onTap={() => {
            void toggleListening();
          }}
        />

        <p className="text-[10px] text-text-secondary-dark/50">
          {isListening
            ? "Tap again to send your voice turn"
            : "Tap to start live microphone streaming"}
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
