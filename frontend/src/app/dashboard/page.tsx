"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Mic, TrendingUp, Clock, Users, Zap, BarChart2 } from "lucide-react";
import toast from "react-hot-toast";
import { sessionsApi, authApi } from "@/lib/api";
import { SessionType } from "@/types";
import { formatSessionDuration, cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import SessionCard from "@/components/SessionCard";
import NewSessionModal from "@/components/NewSessionModal";
import TrendChart from "@/components/TrendChart";

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showNewSession, setShowNewSession] = useState(false);

  // Guard auth
  useEffect(() => {
    if (!localStorage.getItem("inflection_token")) router.push("/");
  }, [router]);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => sessionsApi.list(50).then((r) => r.data),
  });

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me().then((r) => r.data),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: sessionsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Session deleted");
    },
    onError: () => toast.error("Failed to delete session"),
  });

  // Stats
  const completed = sessions.filter((s) => s.status === "completed");
  const totalDuration = completed.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const avgParticipants = completed.length
    ? Math.round(completed.reduce((s, x) => s + x.participant_count, 0) / completed.length)
    : 0;

  // Emotion trend data for chart
  const trendData = completed.slice(-14).map((s) => ({
    date: new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    valence: s.emotion_summary?.valence ?? 0,
    arousal: s.emotion_summary?.arousal ?? 0.5,
    label: s.title,
  }));

  const stats = [
    { label: "Total Sessions", value: sessions.length, icon: Mic, color: "text-primary-light" },
    { label: "Total Talk Time", value: formatSessionDuration(totalDuration), icon: Clock, color: "text-accent-cyan" },
    { label: "Avg Participants", value: avgParticipants || "--", icon: Users, color: "text-accent-purple" },
    { label: "Insights Generated", value: completed.length, icon: BarChart2, color: "text-accent-green" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 pt-24 pb-16">
        {/* Header */}
        <motion.div
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              {user ? `Hello, ${user.name.split(" ")[0]} 👋` : "Dashboard"}
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              Your emotion intelligence hub — {sessions.length} session{sessions.length !== 1 ? "s" : ""} recorded
            </p>
          </div>
          <button
            onClick={() => setShowNewSession(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            New Session
          </button>
        </motion.div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ label, value, icon: Icon, color }, i) => (
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

        {/* Trend chart + Quick record */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-primary-light" />
              <h2 className="section-title">Emotional Valence Trend</h2>
            </div>
            {trendData.length > 1 ? (
              <TrendChart data={trendData} />
            ) : (
              <div className="h-48 flex items-center justify-center text-text-muted text-sm">
                Complete more sessions to see emotional trends
              </div>
            )}
          </div>

          {/* Quick start panel */}
          <motion.div
            className="glass-card p-6 flex flex-col"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Zap size={16} className="text-accent-yellow" />
              <h2 className="section-title">Quick Start</h2>
            </div>
            <p className="text-text-secondary text-sm mb-5">
              Start recording any conversation — our AI will analyze emotions in real-time.
            </p>

            <div className="space-y-2 mb-6">
              {(["meeting", "call", "discussion", "interview"] as SessionType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setShowNewSession(true)}
                  className="w-full text-left px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border hover:border-border-bright transition-all text-sm text-text-secondary hover:text-text-primary flex items-center gap-3"
                >
                  <span>{type === "meeting" ? "🤝" : type === "call" ? "📞" : type === "discussion" ? "💬" : "🎯"}</span>
                  Start {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            <div className="mt-auto p-3 rounded-xl bg-primary/5 border border-primary/10 text-xs text-text-secondary">
              <span className="text-primary-light font-medium">Tip:</span> For best results,
              record in a quiet environment with your microphone close.
            </div>
          </motion.div>
        </div>

        {/* Sessions list */}
        <div>
          <h2 className="section-title mb-4">Recent Sessions</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="glass-card p-5 animate-pulse h-24" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <motion.div
              className="glass-card p-16 flex flex-col items-center justify-center text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Mic size={28} className="text-primary-light" />
              </div>
              <h3 className="text-text-primary font-medium mb-2">No sessions yet</h3>
              <p className="text-text-muted text-sm mb-6 max-w-xs">
                Record your first meeting, call, or conversation to get started with emotion intelligence.
              </p>
              <button onClick={() => setShowNewSession(true)} className="btn-primary flex items-center gap-2">
                <Plus size={16} />
                Start Your First Session
              </button>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session, i) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  index={i}
                  onDelete={(id) => {
                    if (confirm("Delete this session and all its data?")) {
                      deleteMutation.mutate(id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {showNewSession && (
        <NewSessionModal
          onClose={() => setShowNewSession(false)}
          onCreated={(session) => {
            setShowNewSession(false);
            router.push(`/session/live?id=${session.id}`);
          }}
        />
      )}
    </div>
  );
}
