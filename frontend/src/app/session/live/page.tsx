"use client";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Square, Mic, MicOff, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { TranscriptSegment, EmotionScore, WsIncomingMessage } from "@/types";
import { getWsUrl, formatSessionDuration, cn } from "@/lib/utils";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import EmotionDisplay from "@/components/EmotionDisplay";
import Navbar from "@/components/Navbar";

interface LiveEmotionState {
  dominant: string;
  topEmotions: EmotionScore[];
  valence: number;
  arousal: number;
}

interface LiveChunk {
  sequence: number;
  transcript: string;
  segments: TranscriptSegment[];
  emotion: LiveEmotionState;
  timestamp: number;
}

function LiveSessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id");

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartRef = useRef<number>(0);

  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "error" | "done">("connecting");
  const [chunks, setChunks] = useState<LiveChunk[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<LiveEmotionState>({
    dominant: "Listening...",
    topEmotions: [],
    valence: 0,
    arousal: 0.5,
  });
  const [elapsed, setElapsed] = useState(0);
  const [isStopping, setIsStopping] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // WebSocket connection
  useEffect(() => {
    if (!sessionId) { router.push("/dashboard"); return; }
    const token = localStorage.getItem("inflection_token");
    if (!token) { router.push("/"); return; }

    const url = getWsUrl(sessionId, token);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus("connecting");
    ws.onmessage = (e) => handleWsMessage(JSON.parse(e.data) as WsIncomingMessage);
    ws.onerror = () => { setWsStatus("error"); toast.error("Connection error"); };
    ws.onclose = (e) => {
      if (e.code !== 1000) setWsStatus("error");
    };

    return () => {
      ws.close(1000, "Component unmounted");
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer
  useEffect(() => {
    if (wsStatus === "connected") {
      sessionStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [wsStatus]);

  const handleWsMessage = useCallback((msg: WsIncomingMessage) => {
    switch (msg.type) {
      case "connected":
        // Send start signal
        wsRef.current?.send(JSON.stringify({ type: "start", mime_type: "audio/webm" }));
        setWsStatus("connected");
        break;

      case "chunk_result":
        if (msg.transcript || msg.emotion) {
          setChunks((prev) => [...prev, {
            sequence: msg.chunk_sequence,
            transcript: msg.transcript,
            segments: msg.segments,
            emotion: msg.emotion,
            timestamp: msg.timestamp_start,
          }]);
          if (msg.emotion) {
            setCurrentEmotion(msg.emotion);
          }
          // Auto-scroll
          setTimeout(() => transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        }
        break;

      case "session_complete":
        setWsStatus("done");
        if (timerRef.current) clearInterval(timerRef.current);
        toast.success("Session processed! Redirecting to insights...");
        setTimeout(() => router.push(`/session/report?id=${msg.session_id}`), 2000);
        break;

      case "error":
        toast.error(msg.message);
        break;
    }
  }, [router]);

  // Handle audio chunks from recorder
  const handleChunk = useCallback((blob: Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      blob.arrayBuffer().then((buf) => {
        wsRef.current?.send(buf);
      });
    }
  }, []);

  const { state: recordingState, error: recError, level, start, stop, getMimeTypeInUse } = useAudioRecorder({
    onChunk: handleChunk,
    chunkDurationMs: 5000,
  });

  // Auto-start recording when WS is connected
  useEffect(() => {
    if (wsStatus === "connected" && recordingState === "idle") {
      start().catch(console.error);
    }
  }, [wsStatus, recordingState, start]);

  const handleStop = async () => {
    setIsStopping(true);
    stop();
    // Send end signal to backend
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
    }
  };

  if (!sessionId) return null;

  const allTranscript = chunks.map((c) => c.transcript).filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 pt-20 pb-8">
        {/* Status bar */}
        <div className="flex items-center justify-between py-4 mb-4">
          <div className="flex items-center gap-3">
            {wsStatus === "connecting" && (
              <span className="flex items-center gap-2 text-accent-yellow text-sm">
                <span className="w-3 h-3 border-2 border-accent-yellow/30 border-t-accent-yellow rounded-full animate-spin" />
                Connecting...
              </span>
            )}
            {wsStatus === "connected" && !isStopping && (
              <span className="flex items-center gap-2 text-red-400 text-sm font-medium">
                <span className="w-2 h-2 rounded-full bg-red-400 recording-pulse" />
                Recording — {formatSessionDuration(elapsed)}
              </span>
            )}
            {isStopping && (
              <span className="flex items-center gap-2 text-accent-yellow text-sm">
                <span className="w-3 h-3 border-2 border-accent-yellow/30 border-t-accent-yellow rounded-full animate-spin" />
                Processing session...
              </span>
            )}
            {wsStatus === "done" && (
              <span className="flex items-center gap-2 text-accent-green text-sm">
                <CheckCircle2 size={16} />
                Complete — redirecting...
              </span>
            )}
            {wsStatus === "error" && (
              <span className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={16} />
                Connection error
              </span>
            )}
          </div>

          {!isStopping && wsStatus === "connected" && (
            <motion.button
              onClick={handleStop}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 font-medium text-sm transition-all"
              whileTap={{ scale: 0.97 }}
            >
              <Square size={14} />
              Stop & Analyze
            </motion.button>
          )}
        </div>

        {recError && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <MicOff size={16} />
            {recError}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Transcript */}
          <div className="lg:col-span-2 space-y-4">
            {/* Waveform */}
            <div className="glass-card p-6">
              <WaveformVisualizer
                level={level}
                isRecording={recordingState === "recording"}
              />
              <p className="text-center text-text-muted text-xs mt-2">
                {recordingState === "recording" ? "Listening and analyzing..." : "Waiting for microphone..."}
              </p>
            </div>

            {/* Live transcript */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Mic size={15} className="text-primary-light" />
                <h2 className="text-sm font-semibold text-text-primary">Live Transcript</h2>
                <span className="text-xs text-text-muted ml-auto">{chunks.length} segments</span>
              </div>

              <div className="min-h-48 max-h-96 overflow-y-auto space-y-3 pr-1">
                {chunks.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-text-muted text-sm">
                    {wsStatus === "connected" ? "Transcript will appear here as you speak..." : "Connecting..."}
                  </div>
                ) : (
                  chunks.map((chunk) => (
                    <AnimatePresence key={chunk.sequence}>
                      <motion.div
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-1"
                      >
                        {chunk.segments.length > 0 ? (
                          chunk.segments.map((seg, i) => (
                            <div key={i} className="flex gap-3">
                              <div className="flex-shrink-0 mt-0.5">
                                <span className="text-[10px] text-text-muted font-mono bg-surface-2 px-1.5 py-0.5 rounded">
                                  {seg.speaker || `S${seg.speaker_id}`}
                                </span>
                              </div>
                              <p className="text-text-secondary text-sm leading-relaxed">{seg.text}</p>
                            </div>
                          ))
                        ) : chunk.transcript ? (
                          <p className="text-text-secondary text-sm leading-relaxed">{chunk.transcript}</p>
                        ) : null}
                      </motion.div>
                    </AnimatePresence>
                  ))
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          </div>

          {/* Right: Emotion panel */}
          <div className="space-y-4">
            <div className="glass-card p-5">
              <EmotionDisplay
                dominantEmotion={currentEmotion.dominant}
                topEmotions={currentEmotion.topEmotions}
                valence={currentEmotion.valence}
                arousal={currentEmotion.arousal}
                isLive
              />
            </div>

            {/* Emotion history */}
            {chunks.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="text-xs font-semibold text-text-secondary mb-3">Emotion Timeline</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {[...chunks].reverse().slice(0, 12).map((chunk) => (
                    <motion.div
                      key={chunk.sequence}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="text-text-muted w-10 font-mono">
                        {Math.floor(chunk.timestamp / 60)}:{String(Math.floor(chunk.timestamp % 60)).padStart(2, "0")}
                      </span>
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: `var(--emotion-${chunk.emotion.dominant.toLowerCase().replace(/\s+/g, "-")}, #6b7280)` }}
                      />
                      <span className="text-text-secondary truncate">{chunk.emotion.dominant || "—"}</span>
                      {chunk.transcript && (
                        <span className="text-text-muted truncate ml-auto max-w-20">
                          "{chunk.transcript.substring(0, 20)}..."
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Tip */}
            <div className="glass-card p-4 text-xs text-text-muted">
              <p className="font-medium text-text-secondary mb-1">How it works</p>
              <p>Every 5 seconds of audio is analyzed in parallel — Deepgram extracts the words, Hume AI reads the emotional prosody (pitch, energy, tone). Claude synthesizes insights at the end.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LiveSessionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
      <LiveSessionContent />
    </Suspense>
  );
}
