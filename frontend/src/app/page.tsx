"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Brain, TrendingUp, Shield, Eye, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "" });

  useEffect(() => {
    const token = localStorage.getItem("inflection_token");
    if (token) router.replace("/dashboard");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "register") {
        const res = await authApi.register(form.email, form.name, form.password);
        localStorage.setItem("inflection_token", res.data.access_token);
        toast.success("Welcome to Inflection!");
      } else {
        const res = await authApi.login(form.email, form.password);
        localStorage.setItem("inflection_token", res.data.access_token);
        toast.success("Welcome back!");
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Something went wrong";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left — Branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-radial from-primary/10 via-transparent to-transparent" />
        <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-accent-cyan/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Mic size={20} className="text-primary-light" />
          </div>
          <span className="text-xl font-semibold gradient-text">Inflection</span>
        </div>

        {/* Main copy */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-5xl font-bold text-text-primary leading-tight mb-4">
              Understand not just
              <br />
              <span className="gradient-text">what was said</span>
              <br />
              but how it felt.
            </h1>
            <p className="text-text-secondary text-lg leading-relaxed max-w-md">
              AI-powered emotion intelligence that analyzes voice prosody, sentiment,
              and body language signals — giving you the full emotional picture of every conversation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Brain, label: "Emotion AI", desc: "48+ emotions from voice prosody" },
              { icon: Eye, label: "Incongruence", desc: "Detect when words & voice disagree" },
              { icon: TrendingUp, label: "Trends", desc: "Emotional patterns over time" },
              { icon: Zap, label: "Real-time", desc: "Live analysis as you speak" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="glass-card p-4 flex flex-col gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon size={16} className="text-primary-light" />
                </div>
                <div>
                  <div className="text-text-primary text-sm font-medium">{label}</div>
                  <div className="text-text-muted text-xs">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-text-muted text-sm">
          <Shield size={14} />
          <span>Audio processed securely — never stored without your consent</span>
        </div>
      </div>

      {/* Right — Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Mic size={16} className="text-primary-light" />
            </div>
            <span className="text-lg font-semibold gradient-text">Inflection</span>
          </div>

          <div className="glass-card p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-text-primary mb-2">
                {mode === "login" ? "Welcome back" : "Create account"}
              </h2>
              <p className="text-text-secondary text-sm">
                {mode === "login"
                  ? "Sign in to access your sessions and insights"
                  : "Start understanding the emotion behind every word"}
              </p>
            </div>

            {/* Mode toggle */}
            <div className="flex bg-surface-3 rounded-xl p-1 mb-6">
              {(["login", "register"] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    mode === m
                      ? "bg-primary text-white shadow-md"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {m === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence mode="wait">
                {mode === "register" && (
                  <motion.div
                    key="name"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <label className="label">Full Name</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Alex Johnson"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required={mode === "register"}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-2 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : null}
                {mode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>

            {mode === "login" && (
              <p className="mt-4 text-center text-xs text-text-muted">
                Don&apos;t have an account?{" "}
                <button onClick={() => setMode("register")} className="text-primary-light hover:underline">
                  Sign up free
                </button>
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
