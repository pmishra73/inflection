import type { NextConfig } from "next";

const isAndroidBuild = process.env.BUILD_TARGET === "android";

const nextConfig: NextConfig = {
  // Static export for Capacitor Android build
  ...(isAndroidBuild && {
    output: "export",
    trailingSlash: true,
    images: { unoptimized: true },
  }),

  // Rewrites only apply for web (not static export)
  ...(!isAndroidBuild && {
    async rewrites() {
      return [
        {
          source: "/api/v1/:path*",
          destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/:path*`,
        },
      ];
    },
  }),
};

export default nextConfig;
