import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import QueryProvider from "@/components/QueryProvider";

export const metadata: Metadata = {
  title: "Inflection — Emotion Intelligence for Meetings",
  description: "AI-powered emotion analysis for your meetings, calls, and discussions. Understand what was said and how it was felt.",
  keywords: ["emotion AI", "meeting intelligence", "voice analysis", "EQ", "sentiment analysis"],
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-text-primary antialiased">
        <QueryProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#1a1a26",
                color: "#f0f0ff",
                border: "1px solid #2a2a3a",
                borderRadius: "12px",
                fontSize: "14px",
              },
              success: { iconTheme: { primary: "#34d399", secondary: "#1a1a26" } },
              error: { iconTheme: { primary: "#f87171", secondary: "#1a1a26" } },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
