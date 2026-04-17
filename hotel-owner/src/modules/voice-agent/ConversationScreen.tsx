"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/utils/cn";
import { useVoiceStore } from "@/store";
import { ConversationBubble } from "./ConversationBubble";

interface ConversationScreenProps {
  className?: string;
}

export function ConversationScreen({ className }: ConversationScreenProps) {
  const { conversation, isProcessing } = useVoiceStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasPendingMessage = conversation.some((message) => message.status === "pending");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [conversation.length, isProcessing]);

  return (
    <div
      ref={scrollRef}
      className={cn("flex-1 overflow-y-auto px-4", className)}
    >
      {conversation.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" as const }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10"
          >
            <Sparkles className="h-7 w-7 text-accent" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2, ease: "easeOut" as const }}
          >
            <h3 className="text-base font-semibold text-text-primary-dark">
              How can I help?
            </h3>
            <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-text-secondary-dark">
              Tap the microphone and ask naturally about occupancy, revenue, departures, housekeeping, or live operations.
            </p>
          </motion.div>
        </div>
      ) : (
        <div className="space-y-4 py-4">
          {conversation.map((msg, i) => (
            <ConversationBubble key={i} message={msg} />
          ))}

          {/* Typing indicator */}
          {isProcessing && !hasPendingMessage && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-surface-dark/40 px-4 py-3 backdrop-blur-xl">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-2 w-2 rounded-full bg-accent/60"
                    animate={{ y: [0, -6, 0] }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
