"use client";
import { motion } from "framer-motion";

interface Props {
  level: number; // 0–1
  isRecording: boolean;
  bars?: number;
}

export default function WaveformVisualizer({ level, isRecording, bars = 24 }: Props) {
  return (
    <div className="flex items-center justify-center gap-0.5 h-16">
      {[...Array(bars)].map((_, i) => {
        const centerDist = Math.abs(i - bars / 2) / (bars / 2); // 0=center, 1=edge
        const baseHeight = isRecording ? 8 + level * 48 * (1 - centerDist * 0.6) : 4;
        const noise = isRecording ? (Math.sin(i * 1.3) * 0.3 + 0.7) : 0.3;
        const height = Math.max(3, baseHeight * noise);

        return (
          <motion.div
            key={i}
            className="rounded-full flex-shrink-0"
            style={{
              width: 3,
              background: isRecording
                ? `rgba(124, 111, 205, ${0.4 + level * 0.6})`
                : "rgba(90, 90, 122, 0.4)",
            }}
            animate={{ height }}
            transition={{
              duration: 0.1,
              delay: i * 0.01,
              type: "spring",
              stiffness: 400,
              damping: 20,
            }}
          />
        );
      })}
    </div>
  );
}
