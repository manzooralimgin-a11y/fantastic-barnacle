"use client";

import { useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic } from "lucide-react";
import { cn } from "@/utils/cn";
import { useVoiceStore } from "@/store";
import { Header } from "@/components/layout";
import { BottomNav } from "@/components/layout";
import { VoiceButton } from "./VoiceButton";
import { VoiceWaveAnimation } from "./VoiceWaveAnimation";
import { ConversationScreen } from "./ConversationScreen";

// Extend Window type for SpeechRecognition (vendor-prefixed in some browsers)
declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}

function getSpeechRecognition(): typeof SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function VoiceView() {
  const {
    isListening,
    isProcessing,
    startListening,
    stopListening,
    sendQuery,
  } = useVoiceStore();

  const recognitionRef = useRef<InstanceType<typeof SpeechRecognition> | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const handleTap = useCallback(() => {
    if (isProcessing) return;

    // If already listening, stop the recognition session
    if (isListening) {
      recognitionRef.current?.stop();
      stopListening();
      return;
    }

    const SR = getSpeechRecognition();

    if (!SR) {
      // Browser does not support Web Speech API — fall back to typed input
      const text = window.prompt("Voice input is not supported in this browser.\nType your question:");
      if (text?.trim()) sendQuery(text.trim());
      return;
    }

    const recognition = new SR();
    recognitionRef.current = recognition;

    recognition.lang = "de-DE";        // German primary; the backend handles both German & English
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      startListening();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        sendQuery(transcript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn("[VoiceView] SpeechRecognition error:", event.error);
      stopListening();
      if (event.error === "not-allowed") {
        window.alert("Microphone access was denied. Please allow microphone permissions and try again.");
      }
    };

    recognition.onend = () => {
      stopListening();
    };

    recognition.start();
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
