import axios from "axios";
import type { User, Session, SessionListItem, SessionType } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

// Inject auth token on every request
api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("inflection_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("inflection_token");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  register: (email: string, name: string, password: string) =>
    api.post<{ access_token: string }>("/auth/register", { email, name, password }),

  login: (email: string, password: string) =>
    api.post<{ access_token: string }>("/auth/login", { email, password }),

  me: () => api.get<User>("/auth/me"),
};

// Sessions
export const sessionsApi = {
  create: (title: string, session_type: SessionType) =>
    api.post<Session>("/sessions", { title, session_type }),

  list: (limit = 20, offset = 0) =>
    api.get<SessionListItem[]>("/sessions", { params: { limit, offset } }),

  get: (id: string) => api.get<Session>(`/sessions/${id}`),

  update: (id: string, data: { title?: string }) =>
    api.patch<Session>(`/sessions/${id}`, data),

  delete: (id: string) => api.delete(`/sessions/${id}`),

  getAudioSummaryUrl: (id: string) =>
    `${API_BASE}/api/v1/sessions/${id}/audio-summary`,
};

export default api;
