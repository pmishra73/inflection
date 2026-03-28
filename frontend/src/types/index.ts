export type UserPlan = "free" | "pro" | "enterprise";

export interface User {
  id: string;
  email: string;
  name: string;
  plan: UserPlan;
  created_at: string;
}

export type SessionType = "meeting" | "call" | "discussion" | "lecture" | "interview" | "other";
export type SessionStatus = "recording" | "processing" | "completed" | "failed";

export interface TranscriptSegment {
  speaker: string;
  speaker_id: number | string;
  text: string;
  start: number;
  end: number;
  confidence?: number;
  sentiment?: string;
  sentiment_score?: number;
}

export interface EmotionScore {
  name: string;
  score: number;
}

export interface EmotionTimelineEntry {
  timestamp: number;
  timestamp_end: number;
  chunk_sequence: number;
  dominant_emotion: string;
  top_emotions: EmotionScore[];
  valence: number;
  arousal: number;
  aggregate?: Record<string, number>;
  transcript_preview?: string;
}

export interface EmotionSummary {
  dominant_emotion: string;
  top_emotions: EmotionScore[];
  average_valence: number;
  average_arousal: number;
  valence: number;
  arousal: number;
  emotional_arc: "improving" | "declining" | "stable";
  all_scores?: Record<string, number>;
}

export interface ActionItem {
  item: string;
  owner: string;
  priority: "high" | "medium" | "low";
}

export interface Recommendation {
  area: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
}

export interface SpeakerProfile {
  speaker: string;
  dominant_emotions: string[];
  communication_style: string;
  engagement_score: number;
  key_contributions: string[];
}

export interface SessionInsights {
  summary: string;
  key_topics: string[];
  action_items: ActionItem[];
  decisions_made: string[];
  eq_report: {
    overall_tone: string;
    emotional_arc: string;
    stress_indicators: string[];
    engagement_level: "high" | "medium" | "low" | "unknown";
    engagement_reason: string;
    collaboration_quality: string;
    tension_moments: string[];
    positive_moments: string[];
  };
  incongruence_analysis: {
    detected: boolean;
    examples: Array<{
      speaker: string;
      words_said: string;
      voice_emotion: string;
      interpretation: string;
    }>;
    overall_interpretation: string;
  };
  speaker_profiles: SpeakerProfile[];
  recommendations: Recommendation[];
  follow_up_questions: string[];
  sentiment_overall: "positive" | "neutral" | "negative" | "mixed";
  sentiment_score: number;
}

export interface Session {
  id: string;
  user_id: string;
  title: string;
  session_type: SessionType;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript_segments: TranscriptSegment[] | null;
  full_transcript: string | null;
  emotion_timeline: EmotionTimelineEntry[] | null;
  emotion_summary: EmotionSummary | null;
  insights: SessionInsights | null;
  participant_count: number;
  participants: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface SessionListItem {
  id: string;
  title: string;
  session_type: SessionType;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  participant_count: number;
  emotion_summary: EmotionSummary | null;
  insights: SessionInsights | null;
  created_at: string;
}

// WebSocket messages
export type WsIncomingMessage =
  | { type: "connected"; session_id: string }
  | { type: "recording_started" }
  | { type: "chunk_result"; chunk_sequence: number; timestamp_start: number; timestamp_end: number; transcript: string; segments: TranscriptSegment[]; emotion: { dominant: string; top_emotions: EmotionScore[]; valence: number; arousal: number }; sentiment: string | null }
  | { type: "chunk_error"; chunk_sequence: number; message: string }
  | { type: "session_complete"; session_id: string; duration_seconds: number; participant_count: number; insights_preview: string; dominant_emotion: string }
  | { type: "error"; message: string }
  | { type: "timeout"; message: string }
  | { type: "pong" };
