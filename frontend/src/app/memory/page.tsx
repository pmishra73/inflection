"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Brain, Search, Send, Clock, Tag, ChevronRight, Sparkles,
  MessageCircle, Hash, BarChart2, Calendar, Loader2,
} from "lucide-react";
import { memoryApi } from "@/lib/api";
import { Topic, MemoryQueryResponse } from "@/types";
import { formatSessionDuration, cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";

const EXAMPLE_QUESTIONS = [
  "What decisions did I make about the product roadmap?",
  "Who have I had the most tense conversations with?",
  "What were the main action items from last month?",
  "What topics do I discuss most in meetings?",
  "When did I last talk about hiring?",
  "What was the emotional tone of my calls this week?",
];

interface QueryEntry {
  question: string;
  response: MemoryQueryResponse;
  timestamp: Date;
}

export default function MemoryPage() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QueryEntry[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!localStorage.getItem("inflection_token")) router.push("/");
  }, [router]);

  const { data: topics = [] } = useQuery({
    queryKey: ["memory-topics"],
    queryFn: () => memoryApi.topics(60).then((r) => r.data),
  });

  const { data: topicSessions } = useQuery({
    queryKey: ["topic-sessions", selectedTopic],
    queryFn: () => memoryApi.topicSessions(selectedTopic!, 15).then((r) => r.data),
    enabled: !!selectedTopic,
  });

  const handleQuery = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || loading) return;
    setLoading(true);
    setQuestion("");
    try {
      const res = await memoryApi.query(text);
      setHistory((prev) => [{ question: text, response: res.data, timestamp: new Date() }, ...prev]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const confidenceColor = (c: number) =>
    c >= 0.7 ? "text-accent-green" : c >= 0.4 ? "text-accent-yellow" : "text-text-muted";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 pt-24 pb-16">

        {/* Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Brain size={20} className="text-primary-light" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Memory</h1>
              <p className="text-text-secondary text-sm">Your second brain — ask anything about your conversations</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
              Full transcripts retained 1 year
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-light" />
              Topics, insights & EQ data kept forever
            </span>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">

          {/* Left: Query interface */}
          <div className="lg:col-span-2 space-y-4">

            {/* Query input */}
            <div className="glass-card p-4">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                    placeholder="Ask anything about your conversations..."
                    className="w-full pl-9 pr-4 py-2.5 bg-surface-2 border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 focus:bg-surface-3 transition-all"
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => handleQuery()}
                  disabled={!question.trim() || loading}
                  className="px-4 py-2.5 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary-light text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Ask
                </button>
              </div>

              {/* Example questions */}
              {history.length === 0 && (
                <div className="mt-4">
                  <p className="text-xs text-text-muted mb-3">Try asking:</p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleQuery(q)}
                        className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/40 text-text-secondary hover:text-primary-light bg-surface-2 hover:bg-primary/10 transition-all"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Loading state */}
            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="glass-card p-5 flex items-center gap-3 text-text-secondary text-sm"
                >
                  <Loader2 size={16} className="animate-spin text-primary-light" />
                  Searching through your conversation history...
                </motion.div>
              )}
            </AnimatePresence>

            {/* Query history */}
            <div className="space-y-4">
              <AnimatePresence>
                {history.map((entry, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card overflow-hidden"
                  >
                    {/* Question */}
                    <div className="flex items-start gap-3 p-5 border-b border-border">
                      <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <MessageCircle size={14} className="text-primary-light" />
                      </div>
                      <div>
                        <p className="text-text-primary text-sm font-medium">{entry.question}</p>
                        <p className="text-text-muted text-xs mt-0.5">
                          {entry.timestamp.toLocaleTimeString()} · Searched {entry.response.total_sessions_searched} sessions
                        </p>
                      </div>
                    </div>

                    {/* Answer */}
                    <div className="p-5">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-accent-purple/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Sparkles size={14} className="text-accent-purple" />
                        </div>
                        <div className="flex-1">
                          <p className="text-text-primary text-sm leading-relaxed">{entry.response.answer}</p>
                          <p className={cn("text-xs mt-1.5 font-medium", confidenceColor(entry.response.confidence))}>
                            Confidence: {Math.round(entry.response.confidence * 100)}%
                          </p>
                        </div>
                      </div>

                      {/* Referenced sessions */}
                      {entry.response.referenced_sessions.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-text-muted mb-2">Referenced sessions:</p>
                          <div className="flex flex-wrap gap-2">
                            {entry.response.referenced_sessions.map((s) => (
                              <Link
                                key={s.id}
                                href={`/session/report?id=${s.id}`}
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border hover:border-border-bright transition-all text-text-secondary hover:text-text-primary"
                              >
                                <Calendar size={11} />
                                {s.title}
                                <span className="text-text-muted">· {s.date}</span>
                                <ChevronRight size={11} />
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Follow-up suggestions */}
                      {entry.response.follow_up_suggestions?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-text-muted mb-2">Explore further:</p>
                          <div className="flex flex-wrap gap-2">
                            {entry.response.follow_up_suggestions.map((q) => (
                              <button
                                key={q}
                                onClick={() => handleQuery(q)}
                                className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary/40 text-text-muted hover:text-primary-light bg-surface-2 hover:bg-primary/10 transition-all"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Right: Topics sidebar */}
          <div className="space-y-4">
            {/* Topics */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Hash size={15} className="text-primary-light" />
                <h2 className="text-sm font-semibold text-text-primary">Topics Discussed</h2>
                <span className="text-xs text-text-muted ml-auto">{topics.length}</span>
              </div>

              {topics.length === 0 ? (
                <p className="text-text-muted text-xs text-center py-4">
                  Topics will appear here after your first session.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {topics.map((topic: Topic) => (
                    <button
                      key={topic.id}
                      onClick={() => setSelectedTopic(selectedTopic === topic.name ? null : topic.name)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all text-left",
                        selectedTopic === topic.name
                          ? "bg-primary/15 border border-primary/30 text-primary-light"
                          : "bg-surface-2 hover:bg-surface-3 border border-transparent text-text-secondary hover:text-text-primary"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Tag size={11} />
                        {topic.name}
                      </span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                        selectedTopic === topic.name
                          ? "bg-primary/20 text-primary-light"
                          : "bg-surface-3 text-text-muted"
                      )}>
                        {topic.session_count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sessions for selected topic */}
            <AnimatePresence>
              {selectedTopic && topicSessions && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="glass-card p-5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Tag size={14} className="text-primary-light" />
                    <h3 className="text-xs font-semibold text-text-primary truncate">"{selectedTopic}"</h3>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {(topicSessions as any[]).map((s: any) => (
                      <Link
                        key={s.id}
                        href={`/session/report?id=${s.id}`}
                        className="block p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border hover:border-border-bright transition-all"
                      >
                        <p className="text-xs font-medium text-text-primary truncate">{s.title}</p>
                        <p className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1">
                          <Clock size={10} />
                          {s.date ? new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                          {s.duration_seconds && ` · ${formatSessionDuration(s.duration_seconds)}`}
                        </p>
                        {s.summary && (
                          <p className="text-[11px] text-text-muted mt-1.5 line-clamp-2">{s.summary}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Quick links */}
            <div className="glass-card p-5">
              <h3 className="text-xs font-semibold text-text-secondary mb-3">Quick Access</h3>
              <div className="space-y-2">
                <Link href="/profile" className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-surface-2 transition-colors text-xs text-text-secondary hover:text-text-primary">
                  <BarChart2 size={14} className="text-accent-purple" />
                  View EQ Profile
                  <ChevronRight size={12} className="ml-auto" />
                </Link>
                <Link href="/dashboard" className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-surface-2 transition-colors text-xs text-text-secondary hover:text-text-primary">
                  <Clock size={14} className="text-accent-cyan" />
                  All Sessions
                  <ChevronRight size={12} className="ml-auto" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
