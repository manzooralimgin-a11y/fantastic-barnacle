"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface VoiceWaveAnimationProps {
  isActive: boolean;
  className?: string;
}

const barCount = 7;
const barDelays = [0, 0.1, 0.15, 0.05, 0.2, 0.12, 0.08];

export function VoiceWaveAnimation({
  isActive,
  className,
}: VoiceWaveAnimationProps) {
  if (!isActive) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("flex items-center justify-center gap-1", className)}
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-accent"
          initial={{ height: 8 }}
          animate={{
            height: [8, 24 + Math.random() * 16, 12, 28 + Math.random() * 12, 8],
          }}
          transition={{
            duration: 0.8 + Math.random() * 0.4,
            repeat: Infinity,
            repeatType: "reverse",
            delay: barDelays[i],
            ease: "easeInOut",
          }}
        />
      ))}
    </motion.div>
  );
}
