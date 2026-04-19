"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useDashboardStore, useEmailStore, useMeetingStore } from "@/store";

export function GlobalLoadingBar() {
  const dashLoading = useDashboardStore((s) => s.isLoading);
  const emailLoading = useEmailStore((s) => s.isLoading);
  const meetingLoading = useMeetingStore((s) => s.isLoading);

  const isLoading = dashLoading || emailLoading || meetingLoading;

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed left-0 right-0 top-0 z-[60] h-0.5 overflow-hidden bg-accent/10"
        >
          <motion.div
            className="h-full w-1/3 rounded-full bg-accent"
            animate={{ x: ["-100%", "400%"] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
