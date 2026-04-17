"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Card } from "@/components/ui";
import type { ConversationMessage } from "@/store";

interface ConversationBubbleProps {
  message: ConversationMessage;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatInline({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([, v]) => typeof v === "number" || typeof v === "string"
  );
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {entries.slice(0, 4).map(([key, value]) => (
        <div
          key={key}
          className="rounded-lg bg-white/5 px-3 py-2"
        >
          <p className="text-[10px] uppercase tracking-wider text-text-secondary-dark">
            {key.replace(/([A-Z])/g, " $1").trim()}
          </p>
          <p className="text-sm font-bold text-accent">
            {typeof value === "number" && value > 1000
              ? `€${value.toLocaleString()}`
              : String(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function ListInline({ data }: { data: Record<string, unknown> }) {
  const listEntries = Object.entries(data).filter(([, v]) => Array.isArray(v));
  if (listEntries.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {listEntries.map(([key, arr]) => (
        <div key={key}>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary-dark">
            {key.replace(/([A-Z])/g, " $1").trim()}
          </p>
          {(arr as string[]).map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-2 py-0.5 text-xs text-text-primary-dark/80"
            >
              <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
              {String(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ConversationBubble({ message }: ConversationBubbleProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, x: isUser ? 20 : -20, y: 5 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" as const }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[85%]")}>
        {isUser ? (
          <div className="rounded-2xl rounded-br-md bg-accent px-4 py-3">
            <p className="text-sm leading-relaxed text-primary">
              {message.content}
            </p>
          </div>
        ) : (
          <Card
            variant="glass"
            className={cn(
              "rounded-2xl rounded-bl-md px-4 py-3",
              message.dataType === "error" && "border-status-error/40 bg-status-error/10"
            )}
          >
            <p
              className={cn(
                "text-sm leading-relaxed",
                message.dataType === "error"
                  ? "text-status-error"
                  : "text-text-primary-dark"
              )}
            >
              {message.content}
            </p>
            {message.dataType === "list" && message.data != null ? (
              <ListInline data={message.data as Record<string, unknown>} />
            ) : message.dataType !== "error" && message.data != null ? (
              <StatInline data={message.data as Record<string, unknown>} />
            ) : null}
            {message.meta ? (
              <p className="mt-2 text-[10px] text-text-secondary-dark/60">
                {message.meta.route ?? "llm"}
                {message.meta.model ? ` · ${message.meta.model}` : ""}
                {message.meta.usedFallback ? " · fallback" : ""}
                {typeof message.meta.latencyMs === "number" ? ` · ${message.meta.latencyMs}ms` : ""}
              </p>
            ) : null}
          </Card>
        )}
        <p
          className={cn(
            "mt-1 text-[10px] text-text-secondary-dark/50",
            isUser ? "text-right" : "text-left"
          )}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>
    </motion.div>
  );
}
