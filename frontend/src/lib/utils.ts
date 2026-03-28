import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDuration, intervalToDuration } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSessionDuration(seconds: number | null): string {
  if (!seconds) return "--";
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${duration.minutes}m ${duration.seconds}s`;
  return `${duration.hours}h ${duration.minutes}m`;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function getEmotionColor(emotion: string): string {
  const colors: Record<string, string> = {
    Joy: "#fbbf24",
    Excitement: "#f97316",
    Enthusiasm: "#fb923c",
    Satisfaction: "#34d399",
    Contentment: "#6ee7b7",
    Calmness: "#60a5fa",
    Concentration: "#818cf8",
    Interest: "#a78bfa",
    Anger: "#ef4444",
    Fear: "#f87171",
    Sadness: "#94a3b8",
    Disgust: "#a3e635",
    Contempt: "#84cc16",
    Anxiety: "#fb923c",
    Confusion: "#e879f9",
    Surprise: "#67e8f9",
    "Surprise (positive)": "#22d3ee",
    "Surprise (negative)": "#f87171",
    Determination: "#c084fc",
    Pride: "#e879f9",
    Triumph: "#fbbf24",
    Love: "#f472b6",
    Empathic: "#f9a8d4",
    Neutral: "#6b7280",
  };

  for (const [key, color] of Object.entries(colors)) {
    if (emotion.includes(key)) return color;
  }
  return "#6b7280";
}

export function getValenceLabel(valence: number): { label: string; color: string } {
  if (valence > 0.3) return { label: "Positive", color: "#34d399" };
  if (valence < -0.3) return { label: "Negative", color: "#f87171" };
  return { label: "Neutral", color: "#94a3b8" };
}

export function getArousalLabel(arousal: number): { label: string; color: string } {
  if (arousal > 0.65) return { label: "High Energy", color: "#f97316" };
  if (arousal < 0.35) return { label: "Low Energy", color: "#60a5fa" };
  return { label: "Moderate", color: "#a78bfa" };
}

export function getSentimentColor(sentiment: string | null | undefined): string {
  switch (sentiment) {
    case "positive": return "#34d399";
    case "negative": return "#f87171";
    default: return "#94a3b8";
  }
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getWsUrl(sessionId: string, token: string): string {
  const wsBase = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
  return `${wsBase}/ws/session/${sessionId}?token=${token}`;
}
