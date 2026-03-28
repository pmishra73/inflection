"use client";
import { motion, AnimatePresence } from "framer-motion";
import { EmotionScore } from "@/types";
import { getEmotionColor, getValenceLabel, getArousalLabel } from "@/lib/utils";

interface Props {
  dominantEmotion: string;
  topEmotions: EmotionScore[];
  valence: number;
  arousal: number;
  isLive?: boolean;
}

export default function EmotionDisplay({ dominantEmotion, topEmotions, valence, arousal, isLive }: Props) {
  const valenceInfo = getValenceLabel(valence);
  const arousalInfo = getArousalLabel(arousal);
  const dominantColor = getEmotionColor(dominantEmotion);

  return (
    <div className="space-y-4">
      {/* Dominant emotion */}
      <div className="flex items-center justify-between">
        <AnimatePresence mode="wait">
          <motion.div
            key={dominantEmotion}
            initial={{ opacity: 0, scale: 0.9, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3"
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: dominantColor, boxShadow: `0 0 8px ${dominantColor}88` }}
            />
            <div>
              <div className="text-xs text-text-muted mb-0.5">
                {isLive ? "Live Emotion" : "Dominant Emotion"}
              </div>
              <div className="text-text-primary font-semibold text-base">{dominantEmotion}</div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="text-right">
          {isLive && (
            <div className="flex items-center gap-1.5 justify-end mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 recording-pulse" />
              <span className="text-xs text-red-400 font-medium">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Valence / Arousal */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-2 rounded-xl p-3">
          <div className="text-xs text-text-muted mb-2">Valence</div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: valenceInfo.color }}>
              {valenceInfo.label}
            </span>
            <span className="text-xs text-text-muted">{(valence * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: valenceInfo.color }}
              animate={{ width: `${((valence + 1) / 2) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-text-muted mt-1">
            <span>Negative</span>
            <span>Positive</span>
          </div>
        </div>

        <div className="bg-surface-2 rounded-xl p-3">
          <div className="text-xs text-text-muted mb-2">Energy</div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: arousalInfo.color }}>
              {arousalInfo.label}
            </span>
            <span className="text-xs text-text-muted">{(arousal * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: arousalInfo.color }}
              animate={{ width: `${arousal * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-text-muted mt-1">
            <span>Calm</span>
            <span>Energetic</span>
          </div>
        </div>
      </div>

      {/* Top emotions bars */}
      {topEmotions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-text-muted">Top Emotions</div>
          {topEmotions.slice(0, 5).map((e) => (
            <div key={e.name} className="flex items-center gap-2">
              <div className="text-xs text-text-secondary w-28 truncate">{e.name}</div>
              <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: getEmotionColor(e.name) }}
                  animate={{ width: `${e.score * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <div className="text-[10px] text-text-muted w-8 text-right">
                {(e.score * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
