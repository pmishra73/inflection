"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Users, Mic, BarChart2, ChevronRight, Trash2 } from "lucide-react";
import { SessionListItem } from "@/types";
import { formatRelativeTime, formatSessionDuration, getEmotionColor, cn } from "@/lib/utils";

const SESSION_TYPE_ICONS: Record<string, string> = {
  meeting: "🤝",
  call: "📞",
  discussion: "💬",
  lecture: "🎓",
  interview: "🎯",
  other: "📝",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-accent-green/10 text-accent-green border-accent-green/20",
  processing: "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20",
  recording: "bg-red-500/10 text-red-400 border-red-500/20",
  failed: "bg-red-900/20 text-red-500 border-red-900/30",
};

interface Props {
  session: SessionListItem;
  onDelete?: (id: string) => void;
  index?: number;
}

export default function SessionCard({ session, onDelete, index = 0 }: Props) {
  const dominantEmotion = session.emotion_summary?.dominant_emotion;
  const topEmotions = session.emotion_summary?.top_emotions?.slice(0, 3) ?? [];
  const sentiment = session.insights?.sentiment_overall;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="glass-card p-5 hover:border-border-bright transition-all duration-200 group"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="text-2xl mt-0.5 flex-shrink-0">
            {SESSION_TYPE_ICONS[session.session_type] || "📝"}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-text-primary font-medium truncate text-sm">
                {session.title}
              </h3>
              <span className={cn("badge border text-[10px]", STATUS_STYLES[session.status])}>
                {session.status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {formatRelativeTime(session.created_at)}
              </span>
              {session.duration_seconds && (
                <span className="flex items-center gap-1">
                  <Mic size={11} />
                  {formatSessionDuration(session.duration_seconds)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users size={11} />
                {session.participant_count} {session.participant_count === 1 ? "person" : "people"}
              </span>
            </div>

            {/* Top emotions */}
            {topEmotions.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                {topEmotions.map((e) => (
                  <span
                    key={e.name}
                    className="text-[10px] px-2 py-0.5 rounded-full border"
                    style={{
                      color: getEmotionColor(e.name),
                      borderColor: `${getEmotionColor(e.name)}33`,
                      backgroundColor: `${getEmotionColor(e.name)}11`,
                    }}
                  >
                    {e.name}
                  </span>
                ))}
              </div>
            )}

            {/* Insight preview */}
            {session.insights?.summary && (
              <p className="text-text-muted text-xs mt-2 line-clamp-1">
                {session.insights.summary}
              </p>
            )}
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {onDelete && (
            <button
              onClick={(e) => { e.preventDefault(); onDelete(session.id); }}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all"
              title="Delete session"
            >
              <Trash2 size={14} />
            </button>
          )}
          {session.status === "completed" && (
            <Link
              href={`/session/report?id=${session.id}`}
              className="flex items-center gap-1 text-primary-light text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              <BarChart2 size={13} />
              View
              <ChevronRight size={13} />
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}
