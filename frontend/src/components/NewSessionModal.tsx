"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mic } from "lucide-react";
import toast from "react-hot-toast";
import { sessionsApi } from "@/lib/api";
import { Session, SessionType } from "@/types";
import { cn } from "@/lib/utils";

const SESSION_TYPES: { type: SessionType; label: string; icon: string; desc: string }[] = [
  { type: "meeting", label: "Meeting", icon: "🤝", desc: "Team or client meeting" },
  { type: "call", label: "Phone Call", icon: "📞", desc: "1:1 or group call" },
  { type: "discussion", label: "Discussion", icon: "💬", desc: "Informal conversation" },
  { type: "interview", label: "Interview", icon: "🎯", desc: "Job or research interview" },
  { type: "lecture", label: "Lecture", icon: "🎓", desc: "Talk or presentation" },
  { type: "other", label: "Other", icon: "📝", desc: "Any conversation" },
];

interface Props {
  onClose: () => void;
  onCreated: (session: Session) => void;
}

export default function NewSessionModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [selectedType, setSelectedType] = useState<SessionType>("meeting");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await sessionsApi.create(title || `${selectedType} — ${new Date().toLocaleDateString()}`, selectedType);
      onCreated(res.data);
    } catch {
      toast.error("Failed to create session");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={onClose}
        />
        <motion.div
          className="relative z-10 w-full max-w-lg glass-card p-6"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                <Mic size={18} className="text-primary-light" />
              </div>
              <div>
                <h2 className="text-text-primary font-semibold">New Session</h2>
                <p className="text-text-muted text-xs">Configure your recording session</p>
              </div>
            </div>
            <button onClick={onClose} className="text-text-muted hover:text-text-secondary p-1.5 rounded-lg hover:bg-surface-2 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Title */}
          <div className="mb-5">
            <label className="label">Session Name</label>
            <input
              type="text"
              className="input"
              placeholder={`${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} — ${new Date().toLocaleDateString()}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Type */}
          <div className="mb-6">
            <label className="label">Session Type</label>
            <div className="grid grid-cols-3 gap-2">
              {SESSION_TYPES.map(({ type, label, icon, desc }) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all duration-200",
                    selectedType === type
                      ? "border-primary bg-primary/10 text-primary-light"
                      : "border-border bg-surface-2 text-text-secondary hover:border-border-bright"
                  )}
                >
                  <div className="text-lg mb-1">{icon}</div>
                  <div className="text-xs font-medium">{label}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Notice */}
          <div className="p-3 rounded-xl bg-surface-2 border border-border mb-5 text-xs text-text-secondary flex items-start gap-2">
            <span className="text-accent-yellow mt-0.5">⚠</span>
            <span>
              Your microphone will be accessed. Audio is processed securely and
              chunks are not stored — only transcripts and emotion analysis.
            </span>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleCreate} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Mic size={16} />}
              Start Recording
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
