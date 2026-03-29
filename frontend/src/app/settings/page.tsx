"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings, HardDrive, Shield, AlertTriangle, CheckCircle2,
  ExternalLink, Unlink, FolderOpen, Lock, Key, Info, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { driveApi, authApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";

function DriveSection() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const { data: driveStatus, isLoading } = useQuery({
    queryKey: ["drive-status"],
    queryFn: () => driveApi.status().then((r) => r.data),
  });

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me().then((r) => r.data),
  });

  // Handle redirect back from Google OAuth
  useEffect(() => {
    const status = searchParams.get("drive");
    if (status === "connected") {
      toast.success("Google Drive connected successfully!");
      queryClient.invalidateQueries({ queryKey: ["drive-status"] });
    } else if (status === "error") {
      const reason = searchParams.get("reason") || "unknown error";
      toast.error(`Drive connection failed: ${reason}`);
    }
  }, [searchParams, queryClient]);

  const disconnectMutation = useMutation({
    mutationFn: () => driveApi.disconnect(),
    onSuccess: () => {
      toast.success("Google Drive disconnected");
      queryClient.invalidateQueries({ queryKey: ["drive-status"] });
    },
    onError: () => toast.error("Failed to disconnect"),
  });

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await driveApi.getAuthUrl();
      window.location.href = res.data.auth_url;
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Google Drive not configured yet";
      toast.error(msg);
      setConnecting(false);
    }
  };

  const notConfigured = driveStatus && !driveStatus.configured;

  return (
    <div className="space-y-4">

      {/* Status card */}
      <div className="glass-card p-6">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              driveStatus?.connected ? "bg-accent-green/15" : "bg-surface-2"
            )}>
              <HardDrive size={20} className={driveStatus?.connected ? "text-accent-green" : "text-text-muted"} />
            </div>
            <div>
              <h3 className="text-text-primary font-semibold text-sm">Google Drive Storage</h3>
              <p className="text-text-muted text-xs mt-0.5">
                {driveStatus?.connected
                  ? `Connected as ${driveStatus.email}`
                  : "Not connected — recordings stay on our servers only"}
              </p>
            </div>
          </div>

          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
            driveStatus?.connected
              ? "bg-accent-green/10 text-accent-green border-accent-green/20"
              : "bg-surface-2 text-text-muted border-border"
          )}>
            {driveStatus?.connected
              ? <><CheckCircle2 size={12} /> Connected</>
              : "Not connected"}
          </div>
        </div>

        {/* How it works */}
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          {[
            { icon: Lock, title: "AES-256-GCM Encrypted", desc: "Your audio is encrypted before upload. The key is derived server-side from your account — never stored." },
            { icon: FolderOpen, title: "Your Drive, Your Files", desc: "Files are stored in your own Google Drive under inflection/ — Inflection can only see files it created." },
            { icon: Key, title: "Access Only Via Inflection", desc: "Files are encrypted blobs. Without our backend's key derivation, the .enc files are unreadable." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-3 rounded-xl bg-surface-2 border border-border">
              <Icon size={14} className="text-primary-light mb-2" />
              <p className="text-xs font-medium text-text-secondary mb-1">{title}</p>
              <p className="text-[11px] text-text-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Folder structure */}
        {driveStatus?.connected && (
          <div className="p-3 rounded-xl bg-surface-2 border border-border mb-5 font-mono text-xs text-text-muted">
            <p className="text-text-secondary font-medium mb-1.5 font-sans">Drive folder structure:</p>
            <p>📁 My Drive/</p>
            <p className="pl-4">📁 inflection/</p>
            <p className="pl-8">📁 2026-03-29/</p>
            <p className="pl-12">📁 meeting/</p>
            <p className="pl-16">🔒 meeting_20260329_2014.enc</p>
            <p className="pl-12">📁 call/</p>
            <p className="pl-16">🔒 call_20260329_1530.enc</p>
          </div>
        )}

        {/* Critical warning */}
        <div className={cn(
          "p-3 rounded-xl border mb-5 flex items-start gap-2.5 text-xs",
          "bg-accent-yellow/5 border-accent-yellow/20"
        )}>
          <AlertTriangle size={14} className="text-accent-yellow flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-accent-yellow mb-1">Important — do not move or rename files</p>
            <p className="text-text-secondary leading-relaxed">
              Do not move, rename, or delete files inside the <span className="font-mono bg-surface-2 px-1 rounded">inflection/</span> folder
              in your Google Drive. Doing so will break access to those recordings permanently.
              All access to recordings must happen through the Inflection app.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        {notConfigured ? (
          <div className="p-3 rounded-xl bg-surface-2 border border-border text-xs text-text-secondary flex items-start gap-2">
            <Info size={14} className="flex-shrink-0 mt-0.5 text-text-muted" />
            <span>
              Google Drive integration requires setup in Google Cloud Console.
              See <code className="bg-surface-3 px-1 rounded">docs/setup-and-running.md</code> for instructions.
            </span>
          </div>
        ) : driveStatus?.connected ? (
          <button
            onClick={() => {
              if (confirm("Disconnect Google Drive? Future recordings won't be backed up, but existing session data is preserved.")) {
                disconnectMutation.mutate();
              }
            }}
            disabled={disconnectMutation.isPending}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
          >
            {disconnectMutation.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <Unlink size={14} />}
            Disconnect Google Drive
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting || isLoading}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {connecting
              ? <Loader2 size={15} className="animate-spin" />
              : <HardDrive size={15} />}
            Connect Google Drive
            <ExternalLink size={13} />
          </button>
        )}
      </div>

      {/* Privacy details */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={15} className="text-primary-light" />
          <h3 className="text-sm font-semibold text-text-primary">What we can and cannot see</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-medium text-accent-green mb-2">✓ What Inflection can access</p>
            <ul className="space-y-1.5 text-text-secondary">
              <li>• Files created by Inflection (inside inflection/ folder)</li>
              <li>• Your Google account email (to show in settings)</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-red-400 mb-2">✗ What Inflection cannot access</p>
            <ul className="space-y-1.5 text-text-secondary">
              <li>• Any other files in your Google Drive</li>
              <li>• Your Google Docs, Sheets, Photos, etc.</li>
              <li>• Drive storage quota or billing</li>
              <li>• Files shared with you by others</li>
            </ul>
          </div>
        </div>
        <p className="text-[11px] text-text-muted mt-3 pt-3 border-t border-border">
          We use the <code className="bg-surface-2 px-1 rounded">drive.file</code> OAuth scope — the most restrictive available.
          Google enforces this at the API level; it is not possible for Inflection to access other files even if it tried.
        </p>
      </div>
    </div>
  );
}

function SettingsContent() {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("inflection_token")) router.push("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 pt-24 pb-16">
        <motion.div
          className="flex items-center gap-3 mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Settings size={20} className="text-primary-light" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
            <p className="text-text-secondary text-sm mt-0.5">Manage integrations and preferences</p>
          </div>
        </motion.div>

        <DriveSection />
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
