"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, Brain, Zap, Shield, Heart, AlertCircle,
  Calendar, Clock, MessageCircle, Tag, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { memoryApi } from "@/lib/api";
import { getEmotionColor, formatSessionDuration, cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const TREND_STYLES = {
  improving: { color: "text-accent-green", bg: "bg-accent-green/10", icon: TrendingUp, label: "Improving" },
  stable: { color: "text-accent-yellow", bg: "bg-accent-yellow/10", icon: Shield, label: "Stable" },
  declining: { color: "text-red-400", bg: "bg-red-500/10", icon: AlertCircle, label: "Needs attention" },
};

export default function ProfilePage() {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("inflection_token")) router.push("/");
  }, [router]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["eq-profile"],
    queryFn: () => memoryApi.profile().then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-text-muted text-sm">Analysing your conversation history...</p>
        </div>
      </div>
    );
  }

  if (!profile || profile.message) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-4xl mx-auto px-6 pt-24">
          <div className="glass-card p-16 flex flex-col items-center text-center">
            <Brain size={40} className="text-text-muted mb-4" />
            <h2 className="text-text-primary font-semibold mb-2">No data yet</h2>
            <p className="text-text-muted text-sm max-w-xs mb-6">
              Record a few conversations and your emotional intelligence profile will appear here.
            </p>
            <Link href="/dashboard" className="btn-primary flex items-center gap-2">
              <MessageCircle size={16} /> Start a session
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { stats, ai_profile, data_coverage } = profile;
  const trend = TREND_STYLES[stats.emotional_trend as keyof typeof TREND_STYLES] || TREND_STYLES.stable;
  const TrendIcon = trend.icon;

  // Build weekly activity chart data
  const weeklyData = Object.entries(stats.sessions_by_week || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([week, count]) => ({ week: week.replace(/\d{4}-W/, "W"), sessions: count }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 pt-24 pb-16">

        {/* Header */}
        <motion.div
          className="flex items-start justify-between mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <h1 className="text-2xl font-bold text-text-primary">EQ Profile</h1>
            <p className="text-text-secondary text-sm mt-1">
              Your emotional intelligence at a glance — built from {stats.total_sessions} sessions
            </p>
          </div>
          <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium", trend.bg, trend.color, "border-current/20")}>
            <TrendIcon size={15} />
            {trend.label}
          </div>
        </motion.div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Sessions", value: stats.total_sessions, icon: MessageCircle, color: "text-primary-light" },
            { label: "Hours Recorded", value: `${Math.round(stats.total_minutes_recorded / 60 * 10) / 10}h`, icon: Clock, color: "text-accent-cyan" },
            { label: "Avg Valence", value: `${stats.avg_valence > 0 ? "+" : ""}${(stats.avg_valence * 100).toFixed(0)}%`, icon: Heart, color: stats.avg_valence >= 0 ? "text-accent-green" : "text-red-400" },
            { label: "Topics Covered", value: stats.top_topics?.length || 0, icon: Tag, color: "text-accent-purple" },
          ].map(({ label, value, icon: Icon, color }, i) => (
            <motion.div
              key={label}
              className="metric-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Icon size={18} className={color} />
              <div className="text-2xl font-bold text-text-primary mt-1">{value}</div>
              <div className="text-text-muted text-xs">{label}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">

          {/* Left col: AI Profile + Charts */}
          <div className="lg:col-span-2 space-y-5">

            {/* AI EQ Summary */}
            {ai_profile && Object.keys(ai_profile).length > 0 && (
              <motion.div
                className="glass-card p-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Brain size={16} className="text-primary-light" />
                  <h2 className="text-sm font-semibold text-text-primary">AI EQ Assessment</h2>
                  {ai_profile.overall_eq_score !== undefined && (
                    <span className="ml-auto text-2xl font-bold text-primary-light">
                      {ai_profile.overall_eq_score}<span className="text-sm text-text-muted font-normal">/100</span>
                    </span>
                  )}
                </div>

                <p className="text-text-secondary text-sm leading-relaxed mb-4">{ai_profile.eq_description}</p>

                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-text-muted mb-2 font-medium">Communication Style</p>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-accent-purple/10 border border-accent-purple/20 text-accent-purple capitalize">
                      {ai_profile.dominant_communication_style}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-2 font-medium">Emotional Range</p>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan capitalize">
                      {ai_profile.emotional_range}
                    </span>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {ai_profile.top_strengths?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-text-muted mb-2 flex items-center gap-1">
                        <Zap size={11} className="text-accent-green" /> Strengths
                      </p>
                      <ul className="space-y-1.5">
                        {ai_profile.top_strengths.map((s: string) => (
                          <li key={s} className="text-xs text-text-secondary flex items-start gap-1.5">
                            <span className="text-accent-green mt-0.5 flex-shrink-0">✓</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ai_profile.growth_areas?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-text-muted mb-2 flex items-center gap-1">
                        <TrendingUp size={11} className="text-accent-yellow" /> Growth Areas
                      </p>
                      <ul className="space-y-1.5">
                        {ai_profile.growth_areas.map((s: string) => (
                          <li key={s} className="text-xs text-text-secondary flex items-start gap-1.5">
                            <span className="text-accent-yellow mt-0.5 flex-shrink-0">→</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {ai_profile.coaching_tip && (
                  <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-text-secondary">
                    <span className="font-medium text-primary-light">Coaching tip: </span>
                    {ai_profile.coaching_tip}
                  </div>
                )}
              </motion.div>
            )}

            {/* Activity chart */}
            {weeklyData.length > 1 && (
              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={15} className="text-primary-light" />
                  <h2 className="text-sm font-semibold text-text-primary">Weekly Activity</h2>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={weeklyData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                    <defs>
                      <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "var(--text-secondary)" }}
                    />
                    <Area type="monotone" dataKey="sessions" stroke="var(--color-primary)" strokeWidth={2} fill="url(#sessGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recurring patterns */}
            {ai_profile?.recurring_patterns?.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Recurring Patterns</h3>
                <ul className="space-y-2">
                  {ai_profile.recurring_patterns.map((p: string, i: number) => (
                    <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                      <span className="text-primary-light text-xs font-bold mt-0.5">{i + 1}.</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right col: Emotion distribution + Topics */}
          <div className="space-y-5">

            {/* Emotion distribution */}
            {stats.top_emotions?.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="text-xs font-semibold text-text-secondary mb-4">Top Emotions</h3>
                <div className="space-y-2.5">
                  {stats.top_emotions.map(({ name, count }: { name: string; count: number }) => {
                    const pct = Math.round((count / stats.total_sessions) * 100);
                    const color = getEmotionColor(name);
                    return (
                      <div key={name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-text-secondary">{name}</span>
                          <span className="text-text-muted">{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top topics */}
            {stats.top_topics?.length > 0 && (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-text-secondary">Top Topics</h3>
                  <Link href="/memory" className="text-xs text-primary-light hover:underline flex items-center gap-1">
                    Ask <ChevronRight size={11} />
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  {stats.top_topics.map(({ name, count }: { name: string; count: number }) => (
                    <Link
                      key={name}
                      href="/memory"
                      className="text-xs px-2.5 py-1 rounded-full bg-surface-2 hover:bg-surface-3 border border-border hover:border-border-bright text-text-secondary hover:text-text-primary transition-all"
                    >
                      {name}
                      <span className="text-text-muted ml-1">×{count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Data retention info */}
            <div className="glass-card p-5">
              <h3 className="text-xs font-semibold text-text-secondary mb-3">Data Retention</h3>
              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5 text-xs">
                  <div className="w-2 h-2 rounded-full bg-accent-green mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-text-secondary font-medium">Metadata — Forever</p>
                    <p className="text-text-muted">Topics, summaries, EQ scores, decisions</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <div className="w-2 h-2 rounded-full bg-accent-yellow mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-text-secondary font-medium">Full Transcripts — 1 Year</p>
                    <p className="text-text-muted">Raw text, emotion timeline, audio analysis</p>
                  </div>
                </div>
              </div>
              {data_coverage?.oldest_session && (
                <p className="text-[11px] text-text-muted mt-3 pt-3 border-t border-border">
                  Oldest record: {new Date(data_coverage.oldest_session).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
