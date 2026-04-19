"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mic, Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

interface VoiceButtonProps {
  isListening: boolean;
  isProcessing: boolean;
  onTap: () => void;
  className?: string;
}

function PulseRings() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border-2 border-accent/40"
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.6 + i * 0.3, opacity: 0 }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            delay: i * 0.4,
            ease: "easeOut",
          }}
        />
      ))}
    </>
  );
}

function ProcessingRing() {
  return (
    <motion.div
      className="absolute inset-[-4px] rounded-full border-2 border-transparent border-t-accent"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    />
  );
}

export function VoiceButton({
  isListening,
  isProcessing,
  onTap,
  className,
}: VoiceButtonProps) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* Pulse rings when listening */}
      <AnimatePresence>{isListening && <PulseRings />}</AnimatePresence>

      {/* Processing spinner */}
      <AnimatePresence>{isProcessing && <ProcessingRing />}</AnimatePresence>

      {/* Main button */}
      <motion.button
        whileTap={{ scale: 0.93 }}
        animate={
          isListening
            ? { scale: [1, 1.06, 1], backgroundColor: "#D4A843" }
            : { scale: 1, backgroundColor: "#C8A951" }
        }
        transition={
          isListening
            ? { scale: { duration: 1.2, repeat: Infinity, ease: "easeInOut" }, backgroundColor: { duration: 0.3 } }
            : { duration: 0.3, ease: "easeOut" as const }
        }
        onClick={onTap}
        disabled={isProcessing}
        className={cn(
          "relative z-10 flex h-16 w-16 items-center justify-center rounded-full shadow-lg shadow-accent/30 disabled:opacity-70",
          isListening ? "bg-accent-warm" : "bg-accent"
        )}
      >
        <AnimatePresence mode="wait">
          {isProcessing ? (
            <motion.div
              key="loader"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
            >
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </motion.div>
          ) : (
            <motion.div
              key="mic"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
            >
              <Mic className="h-6 w-6 text-primary" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
