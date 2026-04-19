"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Card } from "@/components/ui";
import type { VoiceTimelineMessage } from "@/store";

interface ConversationBubbleProps {
  message: VoiceTimelineMessage;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConversationBubble({ message }: ConversationBubbleProps) {
  const isAssistant = message.role === "assistant";
  const isError = message.kind === "error";

  return (
    <motion.div
      initial={{ opacity: 0, x: isAssistant ? -20 : 20, y: 5 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" as const }}
      className={cn("flex", isAssistant ? "justify-start" : "justify-end")}
    >
      <div className={cn("max-w-[85%]")}>
        {isAssistant ? (
          <Card
            variant="glass"
            className="rounded-2xl rounded-bl-md px-4 py-3"
          >
            <p className="text-sm leading-relaxed text-text-primary-dark">
              {message.content}
            </p>
          </Card>
        ) : (
          <div
            className={cn(
              "rounded-2xl rounded-br-md px-4 py-3",
              isError
                ? "bg-status-error/15 text-status-error"
                : "bg-accent/15 text-accent"
            )}
          >
            <p className="text-sm leading-relaxed">{message.content}</p>
          </div>
        )}
        <p
          className={cn(
            "mt-1 text-[10px] text-text-secondary-dark/50",
            isAssistant ? "text-left" : "text-right"
          )}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>
    </motion.div>
  );
}
