"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "@/utils/cn";

interface AnimatedCounterProps {
  target: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  decimals?: number;
}

export function AnimatedCounter({
  target,
  duration = 1.2,
  prefix = "",
  suffix = "",
  className,
  decimals = 0,
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;

    const startTime = performance.now();

    function update(currentTime: number) {
      const elapsed = (currentTime - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(eased * target);

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        setCount(target);
      }
    }

    requestAnimationFrame(update);
  }, [isInView, target, duration]);

  const formatted =
    decimals > 0
      ? count.toFixed(decimals)
      : Math.round(count).toLocaleString();

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("tabular-nums", className)}
    >
      {prefix}
      {formatted}
      {suffix}
    </motion.span>
  );
}
