import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        surface: "#12121a",
        "surface-2": "#1a1a26",
        "surface-3": "#22222f",
        border: "#2a2a3a",
        "border-bright": "#3a3a50",
        primary: {
          DEFAULT: "#7c6fcd",
          light: "#9d91e0",
          dark: "#5a4fb0",
        },
        accent: {
          cyan: "#22d3ee",
          purple: "#a78bfa",
          pink: "#f472b6",
          green: "#34d399",
          orange: "#fb923c",
          yellow: "#fbbf24",
        },
        text: {
          primary: "#f0f0ff",
          secondary: "#9898b8",
          muted: "#5a5a7a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-glow": "linear-gradient(135deg, #7c6fcd22 0%, #22d3ee22 100%)",
        "card-gradient": "linear-gradient(135deg, #12121a 0%, #1a1a26 100%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "wave": "wave 1.5s ease-in-out infinite",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.4s ease-out",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px #7c6fcd44, 0 0 20px #7c6fcd22" },
          "100%": { boxShadow: "0 0 10px #7c6fcd88, 0 0 40px #7c6fcd44" },
        },
        wave: {
          "0%, 100%": { transform: "scaleY(0.5)" },
          "50%": { transform: "scaleY(1.5)" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      boxShadow: {
        "glow-purple": "0 0 20px #7c6fcd33, 0 0 40px #7c6fcd11",
        "glow-cyan": "0 0 20px #22d3ee33, 0 0 40px #22d3ee11",
        "card": "0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04) inset",
      },
    },
  },
  plugins: [],
};

export default config;
