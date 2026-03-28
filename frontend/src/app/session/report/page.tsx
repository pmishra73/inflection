"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft, Clock, Users, Brain, TrendingUp, AlertTriangle, CheckSquare,
  MessageSquare, Volume2, ChevronDown, ChevronRight, Lightbulb, Target,
  BarChart2, Mic,
} from "lucide-react";
import { sessionsApi } from "@/lib/api";
import { TranscriptSegment, EmotionTimelineEntry, ActionItem } from "@/types";
import {
  formatSessionDuration, formatRelativeTime, getEmotionColor,
  getValenceLabel, getArousalLabel, cn,
} from "@/lib/utils";
import Navbar from "@/components/Navbar";
import EmotionDisplay from "@/components/EmotionDisplay";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const PRIORITY_STYLES = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20",
  low: "bg-accent-green/10 text-accent-green border-accent-green/20",
};

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-surface-2/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon size={16} className="text-primary-light" />
          <span className="font-semibold text-text-primary text-sm">{title}</span>
        </div>
        {open ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function SessionReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("inflection_token")) router.push("/");
    if (!id) router.push("/dashboard");
  }, [router, id]);

  const { data: session, isLoading, error } = useQuery({
    queryKey: ["session", id],
    queryFn: () => sessionsApi.get(id).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) => query.state.data?.status === "processing" ? 3000 : false,
  });

  const handlePlaySummary = async () => {
    const url = sessionsApi.getAudioSummaryUrl(id);
    const token = localStorage.getItem("inflection_token");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    }
  };

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
        <p className="text-text-muted text-sm">Loading session...</p>
      </div>
    </div>
  );

  if (error || !session) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 mb-4">Session not found</p>
        <button onClick={() => router.push("/dashboard")} className="btn-secondary">Back to Dashboard</button>
      </div>
    </div>
  );

  if (session.status === "processing") return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-2xl mx-auto px-6 pt-32 text-center">
        <div className="glass-card p-12">
          <div className="w-16 h-16 border-t-primary rounded-full animate-spin mx-auto mb-6" style={{ borderWidth: 3, borderStyle: "solid", borderColor: "#7c6fcd33", borderTopColor: "#7c6fcd" }} />
          <h2 className="text-xl font-semibold text-text-primary mb-2">Analyzing Your Session</h2>
          <p className="text-text-secondary text-sm">Claude is generating your emotional intelligence report. This takes 30–60 seconds.</p>
          <div className="mt-6 space-y-2 text-xs text-text-muted">
            <p>• Compiling transcript from all chunks</p>
            <p>• Running high-quality transcription via ElevenLabs</p>
            <p>• Detecting emotional patterns and incongruences</p>
            <p>• Generating actionable insights with Claude</p>
          </div>
        </div>
      </div>
    </div>
  );

  const insights = session.insights;
  const emotionSummary = session.emotion_summary;
  const timeline = session.emotion_timeline || [];
  const segments = session.transcript_segments || [];

  const timelineChartData = timeline.map((t: EmotionTimelineEntry) => ({
    time: `${Math.floor(t.timestamp / 60)}:${String(Math.floor(t.timestamp % 60)).padStart(2, "0")}`,
    valence: t.valence,
    arousal: t.arousal,
    emotion: t.dominant_emotion,
  }));

  const radarData = emotionSummary?.top_emotions?.slice(0, 8).map((e) => ({
    emotion: e.name.length > 12 ? e.name.substring(0, 12) + "…" : e.name,
    value: Math.round(e.score * 100),
  })) || [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 pt-20 pb-16">
        {/* Header */}
        <motion.div
          className="flex items-start justify-between pt-6 mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-start gap-4">
            <button onClick={() => router.push("/dashboard")} className="mt-1 text-text-muted hover:text-text-secondary p-2 rounded-lg hover:bg-surface-2 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{session.title}</h1>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-text-muted">
                <span className="flex items-center gap-1"><Clock size={11} />{formatRelativeTime(session.created_at)}</span>
                <span className="flex items-center gap-1"><Mic size={11} />{formatSessionDuration(session.duration_seconds)}</span>
                <span className="flex items-center gap-1"><Users size={11} />{session.participant_count} participant{session.participant_count !== 1 ? "s" : ""}</span>
                <span className="capitalize px-2 py-0.5 rounded-full bg-surface-2 border border-border">{session.session_type}</span>
              </div>
            </div>
          </div>
          <button onClick={handlePlaySummary} className="btn-secondary flex items-center gap-2 text-sm">
            <Volume2 size={15} />
            Hear Summary
          </button>
        </motion.div>

        {audioUrl && (
          <div className="mb-6 glass-card p-4">
            <p className="text-xs text-text-muted mb-2">AI Summary Audio (ElevenLabs)</p>
            <audio controls src={audioUrl} className="w-full h-10" />
          </div>
        )}

        {/* Top metrics */}
        {emotionSummary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Dominant Emotion", value: emotionSummary.dominant_emotion, sub: "from voice prosody", color: getEmotionColor(emotionSummary.dominant_emotion) },
              { label: "Emotional Valence", value: getValenceLabel(emotionSummary.valence).label, sub: `${(emotionSummary.valence * 100).toFixed(0)}% positive`, color: getValenceLabel(emotionSummary.valence).color },
              { label: "Energy Level", value: getArousalLabel(emotionSummary.arousal).label, sub: `Arc: ${emotionSummary.emotional_arc}`, color: getArousalLabel(emotionSummary.arousal).color },
              { label: "Sentiment", value: insights?.sentiment_overall ? insights.sentiment_overall.charAt(0).toUpperCase() + insights.sentiment_overall.slice(1) : "—", sub: insights?.eq_report?.engagement_level ? `Engagement: ${insights.eq_report.engagement_level}` : "", color: insights?.sentiment_overall === "positive" ? "#34d399" : insights?.sentiment_overall === "negative" ? "#f87171" : "#94a3b8" },
            ].map(({ label, value, sub, color }) => (
              <motion.div key={label} className="metric-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="text-text-muted text-xs">{label}</div>
                <div className="text-lg font-bold mt-1" style={{ color }}>{value}</div>
                <div className="text-text-muted text-[10px]">{sub}</div>
              </motion.div>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {insights?.summary && (
              <Section title="Executive Summary" icon={Brain}>
                <p className="text-text-secondary text-sm leading-relaxed">{insights.summary}</p>
                {insights.key_topics?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {insights.key_topics.map((t) => <span key={t} className="badge bg-primary/10 text-primary-light border border-primary/20">{t}</span>)}
                  </div>
                )}
              </Section>
            )}

            {timelineChartData.length > 1 && (
              <Section title="Emotional Arc" icon={TrendingUp}>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={timelineChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="vg2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c6fcd" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#7c6fcd" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "#5a5a7a", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[-1, 1]} tick={{ fill: "#5a5a7a", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                      <div className="glass-card p-2 text-xs">
                        <p className="text-text-muted">{label}</p>
                        <p className="text-primary-light">Valence: {((payload[0]?.value as number) * 100).toFixed(0)}%</p>
                        {payload[0]?.payload?.emotion && <p className="text-text-secondary">{payload[0].payload.emotion}</p>}
                      </div>
                    ) : null} />
                    <Area type="monotone" dataKey="valence" stroke="#7c6fcd" strokeWidth={2} fill="url(#vg2)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Section>
            )}

            {insights?.action_items?.length ? (
              <Section title="Action Items" icon={CheckSquare}>
                <div className="space-y-2.5">
                  {insights.action_items.map((item: ActionItem, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-2">
                      <span className={cn("badge border mt-0.5 flex-shrink-0 text-[10px]", PRIORITY_STYLES[item.priority])}>{item.priority}</span>
                      <div className="min-w-0">
                        <p className="text-text-secondary text-sm">{item.item}</p>
                        {item.owner && item.owner !== "Unknown" && <p className="text-text-muted text-xs mt-0.5">→ {item.owner}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}

            {insights?.eq_report && (
              <Section title="Emotional Intelligence Report" icon={BarChart2}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-surface-2">
                      <div className="text-xs text-text-muted mb-1">Overall Tone</div>
                      <div className="text-sm text-text-secondary">{insights.eq_report.overall_tone}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-2">
                      <div className="text-xs text-text-muted mb-1">Engagement</div>
                      <div className={cn("text-sm font-medium", insights.eq_report.engagement_level === "high" ? "text-accent-green" : insights.eq_report.engagement_level === "low" ? "text-red-400" : "text-accent-yellow")}>
                        {insights.eq_report.engagement_level?.charAt(0).toUpperCase() + insights.eq_report.engagement_level?.slice(1)}
                      </div>
                      <div className="text-xs text-text-muted">{insights.eq_report.engagement_reason}</div>
                    </div>
                  </div>
                  {insights.eq_report.emotional_arc && <div><div className="text-xs text-text-muted mb-1">Emotional Arc</div><p className="text-sm text-text-secondary">{insights.eq_report.emotional_arc}</p></div>}
                  {insights.eq_report.stress_indicators?.length > 0 && (
                    <div>
                      <div className="text-xs text-text-muted mb-2">Stress Indicators</div>
                      <div className="flex flex-wrap gap-2">{insights.eq_report.stress_indicators.map((s: string) => <span key={s} className="badge bg-red-500/10 text-red-400 border border-red-500/20">{s}</span>)}</div>
                    </div>
                  )}
                  {insights.eq_report.positive_moments?.length > 0 && (
                    <div>
                      <div className="text-xs text-text-muted mb-2">Positive Moments</div>
                      <ul className="space-y-1">{insights.eq_report.positive_moments.map((m: string, i: number) => <li key={i} className="text-sm text-accent-green flex items-start gap-2"><span>✓</span>{m}</li>)}</ul>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {insights?.incongruence_analysis?.detected && (
              <Section title="Emotional Incongruence" icon={AlertTriangle} defaultOpen={false}>
                <div className="mb-3 p-3 rounded-xl bg-accent-yellow/5 border border-accent-yellow/20">
                  <p className="text-text-secondary text-sm">{insights.incongruence_analysis.overall_interpretation}</p>
                </div>
                <div className="space-y-3">
                  {insights.incongruence_analysis.examples.map((ex, i) => (
                    <div key={i} className="p-3 rounded-xl bg-surface-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{ex.speaker}</span>
                        <span className="badge bg-accent-yellow/10 text-accent-yellow border border-accent-yellow/20 text-[10px]">{ex.voice_emotion}</span>
                      </div>
                      <p className="text-text-secondary text-sm italic">&ldquo;{ex.words_said}&rdquo;</p>
                      <p className="text-text-muted text-xs">{ex.interpretation}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Full Transcript" icon={MessageSquare} defaultOpen={false}>
              <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                {segments.length > 0 ? segments.map((seg: TranscriptSegment, i: number) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <span className="text-[10px] text-text-muted font-mono bg-surface-2 px-1.5 py-0.5 rounded">{seg.speaker || `S${seg.speaker_id}`}</span>
                    </div>
                    <p className="text-text-secondary text-sm leading-relaxed">{seg.text}</p>
                  </div>
                )) : session.full_transcript ? (
                  <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{session.full_transcript}</p>
                ) : <p className="text-text-muted text-sm">No transcript available</p>}
              </div>
            </Section>
          </div>

          <div className="space-y-5">
            {emotionSummary && (
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><Brain size={15} className="text-primary-light" />Emotion Summary</h3>
                <EmotionDisplay dominantEmotion={emotionSummary.dominant_emotion} topEmotions={emotionSummary.top_emotions || []} valence={emotionSummary.valence} arousal={emotionSummary.arousal} />
              </div>
            )}
            {radarData.length > 2 && (
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Emotion Profile</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#2a2a3a" />
                    <PolarAngleAxis dataKey="emotion" tick={{ fill: "#5a5a7a", fontSize: 9 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="emotion" dataKey="value" stroke="#7c6fcd" fill="#7c6fcd" fillOpacity={0.25} strokeWidth={1.5} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
            {insights?.recommendations?.length ? (
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2"><Lightbulb size={15} className="text-accent-yellow" />Recommendations</h3>
                <div className="space-y-3">
                  {insights.recommendations.map((r, i) => (
                    <div key={i} className="p-3 rounded-xl bg-surface-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-text-secondary">{r.area}</span>
                        <span className={cn("badge border text-[10px]", PRIORITY_STYLES[r.priority])}>{r.priority}</span>
                      </div>
                      <p className="text-text-muted text-xs">{r.suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {insights?.speaker_profiles?.length ? (
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2"><Target size={15} className="text-accent-cyan" />Speaker Profiles</h3>
                <div className="space-y-3">
                  {insights.speaker_profiles.map((sp, i) => (
                    <div key={i} className="p-3 rounded-xl bg-surface-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-text-primary">{sp.speaker}</span>
                        <div className="flex items-center gap-1">
                          <div className="h-1.5 w-16 bg-surface-3 rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${sp.engagement_score * 100}%` }} /></div>
                          <span className="text-[10px] text-text-muted">{Math.round(sp.engagement_score * 100)}%</span>
                        </div>
                      </div>
                      <p className="text-text-muted text-xs mb-2">{sp.communication_style}</p>
                      <div className="flex flex-wrap gap-1">
                        {sp.dominant_emotions.slice(0, 3).map((e) => (
                          <span key={e} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: getEmotionColor(e), backgroundColor: `${getEmotionColor(e)}15`, border: `1px solid ${getEmotionColor(e)}30` }}>{e}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {insights?.follow_up_questions?.length ? (
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Reflect On</h3>
                <ul className="space-y-2">
                  {insights.follow_up_questions.map((q, i) => (
                    <li key={i} className="text-text-secondary text-xs flex items-start gap-2">
                      <span className="text-primary-light mt-0.5 flex-shrink-0">→</span>{q}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SessionReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
      <SessionReportContent />
    </Suspense>
  );
}
