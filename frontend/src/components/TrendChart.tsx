"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface DataPoint {
  date: string;
  valence: number;
  arousal: number;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 text-xs">
      <p className="text-text-secondary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.name === "valence" ? "#7c6fcd" : "#22d3ee" }}>
          {p.name === "valence" ? "Valence" : "Energy"}: {(p.value * 100).toFixed(0)}%
        </p>
      ))}
    </div>
  );
};

export default function TrendChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="valenceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7c6fcd" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7c6fcd" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="arousalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: "#5a5a7a", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis domain={[-1, 1]} tick={{ fill: "#5a5a7a", fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="valence" stroke="#7c6fcd" strokeWidth={2} fill="url(#valenceGrad)" dot={false} />
        <Area type="monotone" dataKey="arousal" stroke="#22d3ee" strokeWidth={1.5} fill="url(#arousalGrad)" dot={false} strokeDasharray="4 2" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
