"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { AudioLines } from "lucide-react";
import { cn } from "@/utils/cn";
import type { VoiceTimelineMessage } from "@/store";
import { ConversationBubble } from "./ConversationBubble";

interface ConversationScreenProps {
  className?: string;
  isAwaitingResponse: boolean;
  messages: VoiceTimelineMessage[];
}

export function ConversationScreen({
  className,
  isAwaitingResponse,
  messages,
}: ConversationScreenProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages.length, isAwaitingResponse]);

  return (
    <div
      ref={scrollRef}
      className={cn("flex-1 overflow-y-auto px-4", className)}
    >
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" as const }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10"
          >
            <AudioLines className="h-7 w-7 text-accent" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2, ease: "easeOut" as const }}
          >
            <h3 className="text-base font-semibold text-text-primary-dark">
              Realtime Voice Ready
            </h3>
            <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-text-secondary-dark">
              Tap once to start streaming microphone audio. Tap again to send
              the turn and hear the assistant reply in voice.
            </p>
          </motion.div>
        </div>
      ) : (
        <div className="space-y-4 py-4">
          {messages.map((message) => (
            <ConversationBubble key={message.id} message={message} />
          ))}

          {isAwaitingResponse && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-surface-dark/40 px-4 py-3 backdrop-blur-xl">
                {[0, 1, 2].map((index) => (
                  <motion.span
                    key={index}
                    className="h-2 w-2 rounded-full bg-accent/60"
                    animate={{ y: [0, -6, 0] }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: index * 0.15,
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
